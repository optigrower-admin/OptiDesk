import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const APP_ID       = process.env.NEXT_PUBLIC_META_APP_ID!
const APP_SECRET   = process.env.META_APP_SECRET!
const REDIRECT_URI = 'https://opti-desk.vercel.app/api/admin/mensajes/oauth-callback'

function popupComplete(base: URL, params: Record<string, string>) {
  const url = new URL('/admin/mensajes/popup-complete', base)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const sp    = request.nextUrl.searchParams
  const code  = sp.get('code')
  const error = sp.get('error')

  if (error || !code) {
    return popupComplete(request.nextUrl, { success: 'false', error: error ?? 'no_code' })
  }

  // Verificar sesión (cookie de Supabase presente en el popup)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return popupComplete(request.nextUrl, { success: 'false', error: 'sin_perfil' })

  // Intercambiar código por token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token` +
    `?client_id=${APP_ID}&client_secret=${APP_SECRET}` +
    `&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  )
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    return popupComplete(request.nextUrl, { success: 'false', error: 'token_error' })
  }

  // Extender a token de larga duración (60 días)
  const llRes = await fetch(
    `https://graph.facebook.com/oauth/access_token` +
    `?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}` +
    `&fb_exchange_token=${tokenData.access_token}`
  )
  const llData    = await llRes.json()
  const accessToken = llData.access_token ?? tokenData.access_token

  // Buscar WABA por múltiples rutas
  let wabaId = ''; let wabaName = ''

  // Ruta A: directo
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
    return popupComplete(request.nextUrl, { success: 'false', error: 'sin_waba' })
  }

  // Obtener números de teléfono
  const r4 = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/phone_numbers?access_token=${accessToken}&fields=id,display_phone_number,verified_name`)
  const d4 = await r4.json()
  const phones: Array<{ id: string; display_phone_number: string; verified_name: string }> = d4.data ?? []

  // Suscribir WABA al webhook de la plataforma
  await fetch(
    `https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps?access_token=${accessToken}&subscribed_fields=messages,message_template_status_update`,
    { method: 'POST' }
  )

  // Sin números — abrir popup de selección vacío con mensaje
  if (phones.length === 0) {
    return popupComplete(request.nextUrl, { success: 'false', error: 'sin_numeros' })
  }

  // Un solo número — guardar automáticamente
  if (phones.length === 1) {
    await guardarConfig(perfil.tenant_id, wabaId, phones[0], accessToken)
    return popupComplete(request.nextUrl, {
      success: 'true',
      phone: phones[0].display_phone_number,
    })
  }

  // Múltiples números — mostrar selección en el popup
  const selectUrl = new URL('/admin/mensajes/popup-select', request.url)
  selectUrl.searchParams.set('waba_id', wabaId)
  selectUrl.searchParams.set('waba_name', encodeURIComponent(wabaName))
  selectUrl.searchParams.set('phones', encodeURIComponent(JSON.stringify(phones)))
  selectUrl.searchParams.set('token', accessToken)
  return NextResponse.redirect(selectUrl)
}

async function guardarConfig(
  tenantId: string,
  wabaId: string,
  phone: { id: string; display_phone_number: string; verified_name: string },
  accessToken: string
) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let vt = ''; for (let i = 0; i < 32; i++) vt += chars[Math.floor(Math.random() * chars.length)]

  let tokenEnc = accessToken
  try { const { encrypt } = await import('@/lib/crypto'); tokenEnc = encrypt(accessToken) } catch { /* dev */ }

  const admin = createAdminClient()
  await admin.from('config_meta').upsert({
    tenant_id:                 tenantId,
    meta_app_id:               APP_ID,
    wa_business_account_id:    wabaId,
    wa_phone_number_id:        phone.id,
    wa_phone_number:           phone.display_phone_number,
    wa_access_token_enc:       tokenEnc,
    meta_webhook_verify_token: vt,
    estado_wa:                 'conectado',
    negocio_verificado:        true,
    limite_diario_wa:          1000,
    mensajes_iniciados_hoy:    0,
    limite_reset_at:           new Date().toISOString(),
    updated_at:                new Date().toISOString(),
  }, { onConflict: 'tenant_id' })
}
