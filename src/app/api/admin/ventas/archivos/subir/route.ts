import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive, getOrCreateDriveSubfolder } from '@/lib/drive'
import { uploadToR2 } from '@/lib/r2'
import { PDFDocument } from 'pdf-lib'
import { comprimirImagen } from '@/lib/comprimirImagen'

export const maxDuration = 60

// Comprime imágenes (reduce resolución + calidad JPEG) y PDFs (recompresión
// sin pérdida de los objetos internos, no toca el contenido visible — no hay
// forma de recomprimir el contenido visual de un PDF de verdad sin
// herramientas pesadas tipo Ghostscript, que este proyecto no tiene). Si algo
// falla, se sube el archivo original sin comprimir en vez de bloquear la subida.
async function comprimirArchivo(buffer: Buffer, mimeType: string, nombre: string): Promise<{ buffer: Buffer; mimeType: string; nombre: string }> {
  try {
    if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') {
      return await comprimirImagen(buffer, mimeType, nombre)
    }
    if (mimeType === 'application/pdf') {
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
      const comprimido = Buffer.from(await doc.save({ useObjectStreams: true }))
      if (comprimido.length < buffer.length) return { buffer: comprimido, mimeType, nombre }
      return { buffer, mimeType, nombre }
    }
  } catch (e) {
    console.error('[archivos/subir] compresión falló, se sube el original:', e)
  }
  return { buffer, mimeType, nombre }
}

const ALLOWED_DOC_TYPES: Record<string, 'pdf' | 'excel' | 'word'> = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'text/csv': 'excel',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
}
const MAX_BYTES = 20 * 1024 * 1024

function buildFolderName(nombre: string | null, celular: string | null): string {
  const n = (nombre ?? 'cliente').replace(/[<>:"/\\|?*]/g, '_').trim() || 'cliente'
  const c = (celular ?? '').replace(/\D/g, '')
  return c ? `${n} - ${c}` : n
}

// Para los documentos del catálogo (Carta de Negociación, Copia Cédula, etc.)
// el nombre del archivo pasa a ser "{Tipo de documento}_{n}_{NOMBRE CLIENTE}"
// en vez del nombre que trae el escaneo/foto (ej. "escan_1787...pdf") — así
// se identifica a simple vista de qué documento y de quién es, tanto en
// Drive como en la lista de Archivos de OptiDesk. El número consecutivo
// permite tener varios archivos del mismo tipo (ej. dos cédulas) sin
// pisarse el nombre.
function nombreDesdeTipoDocumento(tipoDocumento: string, nombreCliente: string | null, seq: number, extOriginal: string): string {
  const tipoSlug = tipoDocumento.trim().replace(/\s+/g, '_')
  const nombreSlug = (nombreCliente ?? 'CLIENTE').trim().toUpperCase().replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_')
  return `${tipoSlug}_${seq}_${nombreSlug}.${extOriginal}`
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const clienteId = formData.get('cliente_id') as string | null
  const tipoDocumento = (formData.get('tipo_documento') as string | null)?.trim() || null
  if (!file || !clienteId) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const tipoDoc = ALLOWED_DOC_TYPES[file.type]
  const isImage = file.type.startsWith('image/')
  if (!tipoDoc && !isImage)
    return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 400 })
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: 'Archivo muy grande (máx 20 MB)' }, { status: 400 })

  const admin = createAdminClient()

  const [clienteRes, tenantRes] = await Promise.all([
    admin.from('clientes')
      .select('nombre, celular, drive_folder_id')
      .eq('id', clienteId).eq('tenant_id', perfil.tenant_id).single(),
    admin.from('tenants')
      .select('ventas_drive_folder_id, google_refresh_token')
      .eq('id', perfil.tenant_id).single(),
  ])

  if (!clienteRes.data) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const bufferOriginal = Buffer.from(await file.arrayBuffer())
  const { buffer, mimeType, nombre: nombreComprimido } = await comprimirArchivo(bufferOriginal, file.type, file.name)
  const tipo = isImage ? 'imagen' : tipoDoc

  let nombreArchivo = nombreComprimido
  if (tipoDocumento) {
    const { count } = await admin.from('archivos_cliente').select('id', { count: 'exact', head: true })
      .eq('cliente_id', clienteId).eq('tipo_documento', tipoDocumento)
    const ext = nombreComprimido.split('.').pop() || 'pdf'
    nombreArchivo = nombreDesdeTipoDocumento(tipoDocumento, clienteRes.data.nombre, (count ?? 0) + 1, ext)
  }

  let url: string
  let drive_url: string | null = null
  let storage_location: 'drive' | 'r2' = 'r2'

  const { ventas_drive_folder_id, google_refresh_token } = tenantRes.data ?? {}

  if (ventas_drive_folder_id && google_refresh_token) {
    const { nombre, celular, drive_folder_id: clienteFolderId } = clienteRes.data

    let subfolderId: string

    if (clienteFolderId) {
      // Ya existe la carpeta del cliente — usar directamente
      subfolderId = clienteFolderId
    } else {
      // Crear subcarpeta con formato "NOMBRE - CELULAR"
      const folderName = buildFolderName(nombre, celular)
      subfolderId = await getOrCreateDriveSubfolder(ventas_drive_folder_id, folderName, google_refresh_token)
      // Guardar el ID de la carpeta en el cliente para futuras subidas y renombrados
      await admin.from('clientes')
        .update({ drive_folder_id: subfolderId })
        .eq('id', clienteId)
    }

    const driveResult = await uploadToDrive(nombreArchivo, mimeType, buffer, subfolderId, google_refresh_token)
    url = driveResult.id
    drive_url = driveResult.webViewLink
    storage_location = 'drive'
  } else {
    const key = `${perfil.tenant_id}/clientes/${clienteId}/${Date.now()}_${nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await uploadToR2(key, buffer, mimeType)
    url = key
    await supabase.rpc('increment_tenant_storage', { p_tenant_id: perfil.tenant_id, p_bytes: buffer.length })
  }

  const { data: archivo, error } = await admin
    .from('archivos_cliente')
    .insert({
      cliente_id: clienteId,
      tenant_id: perfil.tenant_id,
      url,
      tipo,
      tipo_documento: tipoDocumento,
      nombre_archivo: nombreArchivo,
      tamano_bytes: buffer.length,
      storage_location,
      drive_url,
      subido_por: user.id,
    })
    .select('id, tipo, nombre_archivo, created_at, storage_location, drive_url, tipo_documento')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(archivo)
}
