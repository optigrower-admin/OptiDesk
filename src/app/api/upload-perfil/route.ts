import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadToR2 } from '@/lib/r2'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime']
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_VIDEO_BYTES = 200 * 1024 * 1024

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const usuarioId = (formData.get('usuario_id') as string) || user.id
  const tipo = formData.get('tipo') as 'imagen' | 'video'

  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const isImage = tipo === 'imagen'
  const allowed = isImage ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES
  const maxSize = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES

  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: `Tipo no permitido: ${file.type}` }, { status: 400 })
  }
  if (file.size > maxSize) {
    return NextResponse.json({ error: `Archivo muy grande (máx ${isImage ? '20' : '200'} MB)` }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? (isImage ? 'jpg' : 'mp4')
  const nombreArchivo = `perfil_${usuarioId}_${Date.now()}.${ext}`
  const key = `${perfil.tenant_id}/perfiles/${nombreArchivo}`

  const buffer = Buffer.from(await file.arrayBuffer())
  await uploadToR2(key, buffer, file.type)

  const { data: medio, error } = await supabase.from('medios_perfil').insert({
    usuario_id: usuarioId,
    tenant_id: perfil.tenant_id,
    url: key,
    tipo,
    nombre_archivo: file.name,
    storage_location: 'r2',
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: (medio as { id: string }).id, url: key })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })

  await supabase.from('medios_perfil').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
