import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET /api/cotizaciones-servtec/[id]
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const admin = createAdminClient()
  const { data: cot } = await admin.from('cotizaciones_servtec').select('*').eq('id', params.id).single()
  if (!cot || cot.tenant_id !== perfil.tenant_id) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const { data: items } = await admin.from('cotizaciones_servtec_items')
    .select('*').eq('cotizacion_id', params.id).order('orden')

  return NextResponse.json({ ...cot, items: items ?? [] })
}

// DELETE /api/cotizaciones-servtec/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const admin = createAdminClient()
  const { data: cot } = await admin.from('cotizaciones_servtec').select('tenant_id').eq('id', params.id).single()
  if (!cot || cot.tenant_id !== perfil.tenant_id) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  await admin.from('cotizaciones_servtec').delete().eq('id', params.id)
  return NextResponse.json({ ok: true })
}
