import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { probarWebhook } from '@/lib/webhooks/disparar'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['gerencia', 'control_total'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { subscription_id } = await req.json()
  if (!subscription_id) return NextResponse.json({ error: 'Falta subscription_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: sub } = await admin
    .from('webhook_subscriptions')
    .select('id')
    .eq('id', subscription_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!sub) return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })

  try {
    await probarWebhook(subscription_id)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al probar el webhook' }, { status: 500 })
  }
}
