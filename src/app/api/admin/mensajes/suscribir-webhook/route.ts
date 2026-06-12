import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST — suscribir (o re-suscribir) el WABA al webhook de la plataforma
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const { data: cfg } = await admin
    .from('config_meta')
    .select('wa_business_account_id, wa_access_token_enc')
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()

  if (!cfg?.wa_business_account_id) return NextResponse.json({ error: 'No hay WhatsApp configurado' }, { status: 400 })
  if (!cfg.wa_access_token_enc) return NextResponse.json({ error: 'Sin token de acceso. Reconecta WhatsApp.' }, { status: 400 })

  let token = cfg.wa_access_token_enc
  try { const { decrypt } = await import('@/lib/crypto'); token = decrypt(cfg.wa_access_token_enc) } catch { /* sin key = dev */ }

  const res  = await fetch(
    `https://graph.facebook.com/v20.0/${cfg.wa_business_account_id}/subscribed_apps` +
    `?access_token=${token}&subscribed_fields=messages,message_template_status_update`,
    { method: 'POST' }
  )
  const data = await res.json()
  console.log('[suscribir-webhook]', JSON.stringify(data))

  if (data.success) return NextResponse.json({ ok: true })
  return NextResponse.json({ error: data.error?.message ?? 'Error al suscribir' }, { status: 400 })
}
