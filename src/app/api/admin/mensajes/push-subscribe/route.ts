import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin perfil' }, { status: 403 })

  const body = await req.json()
  const sub: { endpoint: string; keys: { p256dh: string; auth: string } } = body.subscription
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth)
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })

  const admin = createAdminClient()
  await admin.from('push_subscriptions').upsert({
    tenant_id: perfil.tenant_id,
    user_id:   user.id,
    endpoint:  sub.endpoint,
    p256dh:    sub.keys.p256dh,
    auth:      sub.keys.auth,
  }, { onConflict: 'user_id,endpoint' })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { endpoint } = await req.json()
  const admin = createAdminClient()
  await admin.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', endpoint)
  return NextResponse.json({ ok: true })
}
