import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const APP_ID      = process.env.NEXT_PUBLIC_META_APP_ID!
const APP_SECRET  = process.env.META_APP_SECRET!
const REDIRECT_URI = 'https://opti-desk.vercel.app/api/admin/mensajes/oauth-callback'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  const base = new URL('/admin/mensajes/conexion', request.url)

  if (error || !code) {
    base.searchParams.set('error', error ?? 'no_code')
    return NextResponse.redirect(base)
  }

  // Verificar sesión del usuario (cookie de Supabase viene en el request)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) {
    base.searchParams.set('error', 'sin_perfil')
    return NextResponse.redirect(base)
  }

  // Intercambiar código por token (con redirect_uri correcto)
  const tokenRes = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token` +
    `?client_id=${APP_ID}&client_secret=${APP_SECRET}` +
    `&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  )
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    base.searchParams.set('error', 'token_' + (tokenData.error?.code ?? 'unknown'))
    return NextResponse.redirect(base)
  }

  // Extender a token de larga duración (60 días)
  const llRes = await fetch(
    `https://graph.facebook.com/oauth/access_token` +
    `?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}` +
    `&fb_exchange_token=${tokenData.access_token}`
  )
  const llData = await llRes.json()
  const accessToken = llData.access_token ?? tokenData.access_token

  // Buscar WABA por múltiples rutas
  let wabaId = ''
  let wabaName = ''

  // Ruta A: directo en /me/whatsapp_business_accounts
  const r1 = await fetch(`https://graph.facebook.com/v20.0/me/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name`)
  const d1 = await r1.json()
  if (d1.data?.length) { wabaId = d1.data[0].id; wabaName = d1.data[0].name }

  // Ruta B: a través de negocios
  if (!wabaId) {
    const r2 = await fetch(`https://graph.facebook.com/v20.0/me/businesses?access_token=${accessToken}&fields=id,name`)
    const d2 = await r2.json()
    for (const biz of (d2.data ?? [])) {
      const r3 = await fetch(`https://graph.facebook.com/v20.0/${biz.id}/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name`)
      const d3 = await r3.json()
      if (d3.data?.length) { wabaId = d3.data[0].id; wabaName = d3.data[0].name || biz.name; break }
    }
  }

  if (!wabaId) {
    base.searchParams.set('error', 'sin_waba')
    return NextResponse.redirect(base)
  }

  // Obtener números de teléfono
  const r4 = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/phone_numbers?access_token=${accessToken}&fields=id,display_phone_number,verified_name`)
  const d4 = await r4.json()
  const phoneNumbers: Array<{ id: string; display_phone_number: string; verified_name: string }> = d4.data ?? []

  // Suscribir WABA al webhook
  await fetch(`https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps?access_token=${accessToken}&subscribed_fields=messages,message_template_status_update`, { method: 'POST' })

  if (phoneNumbers.length === 0) {
    // No hay números — guardar WABA y redirigir para que el usuario agregue número
    base.searchParams.set('waba_id', wabaId)
    base.searchParams.set('waba_name', encodeURIComponent(wabaName))
    base.searchParams.set('token', accessToken)
    base.searchParams.set('step', 'add_number')
    return NextResponse.redirect(base)
  }

  if (phoneNumbers.length === 1) {
    // Un solo número — guardar automáticamente
    await guardarConfig(perfil.tenant_id, wabaId, phoneNumbers[0], accessToken)
    base.searchParams.set('connected', 'true')
    return NextResponse.redirect(base)
  }

  // Múltiples números — redirigir para selección
  base.searchParams.set('waba_id', wabaId)
  base.searchParams.set('waba_name', encodeURIComponent(wabaName))
  base.searchParams.set('phones', encodeURIComponent(JSON.stringify(phoneNumbers)))
  base.searchParams.set('token', accessToken)
  base.searchParams.set('step', 'select')
  return NextResponse.redirect(base)
}

async function guardarConfig(
  tenantId: string,
  wabaId: string,
  phone: { id: string; display_phone_number: string; verified_name: string },
  accessToken: string
) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let verifyToken = ''; for (let i = 0; i < 32; i++) verifyToken += chars[Math.floor(Math.random() * chars.length)]

  let tokenEnc = accessToken
  try { const { encrypt } = await import('@/lib/crypto'); tokenEnc = encrypt(accessToken) } catch { /* dev */ }

  const admin = createAdminClient()
  await admin.from('config_meta').upsert({
    tenant_id:                 tenantId,
    meta_app_id:               process.env.NEXT_PUBLIC_META_APP_ID,
    wa_business_account_id:    wabaId,
    wa_phone_number_id:        phone.id,
    wa_phone_number:           phone.display_phone_number,
    wa_access_token_enc:       tokenEnc,
    meta_webhook_verify_token: verifyToken,
    estado_wa:                 'conectado',
    negocio_verificado:        true,
    limite_diario_wa:          1000,
    mensajes_iniciados_hoy:    0,
    limite_reset_at:           new Date().toISOString(),
    updated_at:                new Date().toISOString(),
  }, { onConflict: 'tenant_id' })
}
