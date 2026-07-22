import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive, getOrCreateDriveSubfolder } from '@/lib/drive'
import { uploadToR2 } from '@/lib/r2'

export const maxDuration = 60

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

  const buffer = Buffer.from(await file.arrayBuffer())
  const tipo = isImage ? 'imagen' : tipoDoc

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

    const driveResult = await uploadToDrive(file.name, file.type, buffer, subfolderId, google_refresh_token)
    url = driveResult.id
    drive_url = driveResult.webViewLink
    storage_location = 'drive'
  } else {
    const key = `${perfil.tenant_id}/clientes/${clienteId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await uploadToR2(key, buffer, file.type)
    url = key
    await supabase.rpc('increment_tenant_storage', { p_tenant_id: perfil.tenant_id, p_bytes: file.size })
  }

  const { data: archivo, error } = await admin
    .from('archivos_cliente')
    .insert({
      cliente_id: clienteId,
      tenant_id: perfil.tenant_id,
      url,
      tipo,
      nombre_archivo: file.name,
      tamano_bytes: file.size,
      storage_location,
      drive_url,
      subido_por: user.id,
    })
    .select('id, tipo, nombre_archivo, created_at, storage_location, drive_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(archivo)
}
