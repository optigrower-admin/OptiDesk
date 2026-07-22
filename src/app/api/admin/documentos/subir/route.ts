import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  let fd: FormData
  try { fd = await req.formData() }
  catch { return NextResponse.json({ error: 'Error al procesar archivo' }, { status: 400 }) }

  const file = fd.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const nombre        = (fd.get('nombre') as string | null)?.trim() || file.name
  const categoria     = (fd.get('categoria') as string | null)?.trim() || 'General'
  const fecha_emision    = (fd.get('fecha_emision') as string | null) || null
  const fecha_vencimiento = (fd.get('fecha_vencimiento') as string | null) || null
  const anotaciones   = (fd.get('anotaciones') as string | null)?.trim() || null

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext    = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path   = `${perfil!.tenant_id}/${crypto.randomUUID()}.${ext}`

  const admin = createAdminClient()

  const { error: upErr } = await admin.storage
    .from('docs-internos')
    .upload(path, buffer, { contentType: file.type || 'application/octet-stream' })

  if (upErr) return NextResponse.json({ error: 'Error al subir: ' + upErr.message }, { status: 500 })

  const { data: doc, error: dbErr } = await admin
    .from('documentos_internos')
    .insert({
      tenant_id: perfil!.tenant_id,
      nombre,
      storage_path: path,
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
      categoria,
      fecha_emision: fecha_emision || null,
      fecha_vencimiento: fecha_vencimiento || null,
      anotaciones: anotaciones || null,
    })
    .select()
    .single()

  if (dbErr) {
    await admin.storage.from('docs-internos').remove([path])
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, doc })
}
