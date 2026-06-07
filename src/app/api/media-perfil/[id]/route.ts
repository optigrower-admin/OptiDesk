import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedDownloadUrl, deleteFromR2 } from '@/lib/r2'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: medio } = await supabase.from('medios_perfil')
    .select('url, tenant_id')
    .eq('id', params.id)
    .single()

  if (!medio) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const signedUrl = await getSignedDownloadUrl(medio.url, 3600)
  return NextResponse.redirect(signedUrl, 302)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: medio } = await supabase.from('medios_perfil')
    .select('url, usuario_id')
    .eq('id', params.id)
    .single()

  if (!medio) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  try { await deleteFromR2(medio.url) } catch { /* ignore */ }
  await supabase.from('medios_perfil').delete().eq('id', params.id)

  return NextResponse.json({ ok: true })
}
