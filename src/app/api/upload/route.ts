import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadToR2 } from '@/lib/r2'
import { archiveToLimit, LIMITE_TRIGGER_BYTES } from '@/lib/archiveToLimit'

export const maxDuration = 60

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
// Android puede enviar video/3gpp, video/webm, o application/octet-stream (OPPO/Huawei)
const ALLOWED_VIDEO_TYPES = [
  'video/mp4', 'video/quicktime',
  'video/3gpp', 'video/3gpp2',
  'video/webm', 'video/x-matroska',
  'video/mpeg',
  'application/octet-stream', // OPPO ColorOS / Huawei EMUI reportan este tipo para videos
  '',                          // Algunos navegadores Android no reportan MIME
]
const ALLOWED_DOC_TYPES: Record<string, 'pdf' | 'excel' | 'word'> = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'text/csv': 'excel',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
}
const MAX_IMAGE_BYTES = 20 * 1024 * 1024   // 20 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024  // 200 MB (reducido para mobile)
const MAX_DOC_BYTES   = 20 * 1024 * 1024   // 20 MB

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const formData  = await req.formData()
  const file      = formData.get('file') as File | null
  const ordenId   = formData.get('orden_id') as string | null
  const clienteId = formData.get('cliente_id') as string | null
  const tipoForm  = formData.get('tipo') as string | null

  if (!file || (!ordenId && !clienteId)) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  // ── Subida de archivo asociado a un CLIENTE (Seguimiento Ventas) ──
  if (clienteId) {
    const tipoDoc = ALLOWED_DOC_TYPES[file.type]
    const isImage = file.type.startsWith('image/') && ALLOWED_IMAGE_TYPES.includes(file.type)
    if (!tipoDoc && !isImage) {
      return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 400 })
    }
    const maxSize = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES
    if (file.size > maxSize) {
      return NextResponse.json({ error: `Archivo muy grande (máx ${maxSize / (1024 * 1024)} MB)` }, { status: 400 })
    }

    const { data: cliente } = await supabase
      .from('clientes').select('id, nombre').eq('id', clienteId).eq('tenant_id', perfil.tenant_id).single()
    if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    const nombreBase = (cliente.nombre ?? 'cliente').replace(/[^a-zA-Z0-9]/g, '_')
    const ext = (file.name.split('.').pop()?.toLowerCase()) ?? 'bin'
    const timestamp = Date.now()
    const nombreArchivo = `${nombreBase}_${timestamp}.${ext}`
    const key = `${perfil.tenant_id}/clientes/${clienteId}/${nombreArchivo}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadToR2(key, buffer, file.type)

    const { data: archivo } = await supabase
      .from('archivos_cliente')
      .insert({
        cliente_id:       clienteId,
        tenant_id:        perfil.tenant_id,
        url:              key,
        tipo:              isImage ? 'imagen' : tipoDoc,
        nombre_archivo:   file.name,
        tamano_bytes:     file.size,
        storage_location: 'r2',
        subido_por:       user.id,
      })
      .select('id, url, tipo, nombre_archivo')
      .single()

    await supabase.rpc('increment_tenant_storage', { p_tenant_id: perfil.tenant_id, p_bytes: file.size })

    return NextResponse.json(archivo ?? { error: 'No se guardó el registro' })
  }

  // ── Subida de foto/video asociada a una ORDEN (Servicio Técnico) — sin cambios ──
  const tipo = tipoForm as 'imagen' | 'video'
  const isImage  = tipo === 'imagen'
  const allowed  = isImage ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES
  const maxSize  = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES

  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 400 })
  }
  if (file.size > maxSize) {
    return NextResponse.json({ error: `Archivo muy grande (máx ${isImage ? '20' : '200'} MB)` }, { status: 400 })
  }

  // Obtener placa y número de orden para nombrar el archivo
  const { data: orden } = await supabase
    .from('ordenes')
    .select('placa, numero')
    .eq('id', ordenId as string)
    .single()

  const placa  = (orden?.placa ?? 'SIN_PLACA').replace(/[^a-zA-Z0-9]/g, '_')
  const numero = orden?.numero ?? 0
  const ext    = (file.name.split('.').pop()?.toLowerCase()) ?? (isImage ? 'jpg' : 'mp4')
  const timestamp    = Date.now()
  const nombreArchivo = `${placa}_#${numero}_${timestamp}.${ext}`
  const key           = `${perfil.tenant_id}/${placa}/${nombreArchivo}`

  const buffer = Buffer.from(await file.arrayBuffer())
  await uploadToR2(key, buffer, file.type)

  const { data: medio } = await supabase
    .from('medios')
    .insert({
      orden_id:         ordenId,
      tenant_id:        perfil.tenant_id,
      url:              key,
      tipo,
      nombre_archivo:   nombreArchivo,
      tamano_bytes:     file.size,
      storage_location: 'r2',
      subido_por:       user.id,
    })
    .select('id, url, tipo')
    .single()

  await supabase.rpc('increment_tenant_storage', {
    p_tenant_id: perfil.tenant_id,
    p_bytes: file.size,
  })

  // Auto-archivado: si el storage supera 8 GB y está habilitado, mover a Drive en background
  const { data: tenantPost } = await supabase
    .from('tenants')
    .select('storage_usado_bytes, archivado_drive_habilitado, drive_folder_id, google_refresh_token')
    .eq('id', perfil.tenant_id)
    .single()

  if (
    tenantPost?.archivado_drive_habilitado &&
    tenantPost.storage_usado_bytes > LIMITE_TRIGGER_BYTES
  ) {
    // Fire and forget — no bloquea la respuesta al cliente
    archiveToLimit(perfil.tenant_id, tenantPost, supabase).catch(() => {})
  }

  return NextResponse.json(medio ?? { error: 'No se guardó el registro' })
}
