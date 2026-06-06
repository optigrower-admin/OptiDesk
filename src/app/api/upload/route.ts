import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadToR2 } from '@/lib/r2'
import { archiveToLimit, LIMITE_TRIGGER_BYTES } from '@/lib/archiveToLimit'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime']
const MAX_IMAGE_BYTES = 20 * 1024 * 1024   // 20 MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024  // 500 MB

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const formData = await req.formData()
  const file    = formData.get('file') as File | null
  const ordenId = formData.get('orden_id') as string
  const tipo    = formData.get('tipo') as 'imagen' | 'video'

  if (!file || !ordenId) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const isImage  = tipo === 'imagen'
  const allowed  = isImage ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES
  const maxSize  = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES

  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 400 })
  }
  if (file.size > maxSize) {
    return NextResponse.json({ error: `Archivo muy grande (máx ${isImage ? '20' : '500'} MB)` }, { status: 400 })
  }

  // Obtener placa y número de orden para nombrar el archivo
  const { data: orden } = await supabase
    .from('ordenes')
    .select('placa, numero')
    .eq('id', ordenId)
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
