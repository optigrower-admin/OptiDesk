import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadToDrive, getOrCreateDriveSubfolder } from '@/lib/drive'
import { registrarAuditoria } from '@/lib/audit'

export const maxDuration = 60
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  // Leer la carpeta configurada y el token OAuth del tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('google_refresh_token, drive_folder_id')
    .eq('id', perfil.tenant_id)
    .single()

  if (!tenant?.google_refresh_token) {
    return NextResponse.json({ error: 'Google Drive no conectado. Conéctalo en Configuración.' }, { status: 400 })
  }
  if (!tenant.drive_folder_id) {
    return NextResponse.json({ error: 'Carpeta de Drive no configurada. Pégala en Configuración.' }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo enviado.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const ordenId = formData.get('orden_id') as string | null
  const tipo = (formData.get('tipo') as string | null) ?? 'imagen'

  if (!file || !ordenId) {
    return NextResponse.json({ error: 'Faltan parámetros: file y orden_id son requeridos.' }, { status: 400 })
  }

  // Obtener placa de la orden para crear la subcarpeta
  const { data: orden } = await supabase
    .from('ordenes').select('placa, numero').eq('id', ordenId).single()

  const placaNorm = (orden?.placa ?? 'SIN_PLACA').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()
  const numero = orden?.numero ?? 0
  const ext = (file.name.split('.').pop()?.toLowerCase()) ?? 'jpg'
  const timestamp = Date.now()
  const nombreArchivo = `${placaNorm}_#${numero}_${timestamp}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'image/jpeg'

  // Extraer ID de carpeta (acepta URL completa o solo el ID)
  const folderRaw = tenant.drive_folder_id
  const folderId = folderRaw.includes('/')
    ? (folderRaw.split('/folders/')[1]?.split('?')[0] ?? folderRaw)
    : folderRaw

  // Crear/buscar subcarpeta por placa dentro de la carpeta raíz
  const subFolderId = await getOrCreateDriveSubfolder(
    folderId,
    placaNorm,
    tenant.google_refresh_token,
  )

  // Subir archivo a Drive
  const { id: driveFileId, webViewLink } = await uploadToDrive(
    nombreArchivo,
    mimeType,
    buffer,
    subFolderId,
    tenant.google_refresh_token,
  )

  // Registrar en la tabla medios
  const { data: medio, error: medioErr } = await supabase.from('medios').insert({
    orden_id: ordenId,
    tenant_id: perfil.tenant_id,
    url: driveFileId,
    tipo,
    nombre_archivo: nombreArchivo,
    tamano_bytes: buffer.length,
    storage_location: 'drive',
    drive_url: webViewLink,
    subido_por: user.id,
  }).select('id, url, tipo, drive_url, storage_location').single()

  if (medioErr || !medio) {
    return NextResponse.json({ error: medioErr?.message ?? 'No se guardó el registro' }, { status: 500 })
  }

  await registrarAuditoria(supabase, {
    tenant_id: perfil.tenant_id,
    tabla: 'medios',
    registro_id: medio.id,
    tipo: 'movimiento',
    valor_nuevo: { tipo, nombre_archivo: nombreArchivo, orden_id: ordenId, storage_location: 'drive' },
    descripcion: `Subió foto "${nombreArchivo}" a Google Drive (placa ${placaNorm})`,
    usuario_id: user.id,
  })

  return NextResponse.json({ id: medio.id, url: webViewLink, tipo })
}
