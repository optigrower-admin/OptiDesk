import { createClient } from '@/lib/supabase/server'
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
    console.error('[oauth-callback] Sin código:', error)
    return popupComplete(request.nextUrl, { success: 'false', error: error ?? 'no_code' })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return popupComplete(request.nextUrl, { success: 'false', error: 'sin_perfil' })

  // Intercambiar código → token corto → largo (60 días)
  const tokenRes = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token` +
    `?client_id=${APP_ID}&client_secret=${APP_SECRET}` +
    `&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  )
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    console.error('[oauth-callback] Error token:', tokenData)
    return popupComplete(request.nextUrl, { success: 'false', error: 'token_error' })
  }

  const llRes = await fetch(
    `https://graph.facebook.com/oauth/access_token` +
    `?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}` +
    `&fb_exchange_token=${tokenData.access_token}`
  )
  const llData      = await llRes.json()
  const accessToken = llData.access_token ?? tokenData.access_token

  // ── Buscar WABA ──────────────────────────────────────────────────────────────
  let wabaId = ''; let wabaName = ''

  const r1 = await fetch(`https://graph.facebook.com/v20.0/me/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name`)
  const d1 = await r1.json()
  console.log('[oauth-callback] Ruta A:', JSON.stringify(d1))
  if (d1.data?.length) { wabaId = d1.data[0].id; wabaName = d1.data[0].name ?? '' }

  if (!wabaId) {
    const r2 = await fetch(`https://graph.facebook.com/v20.0/me/businesses?access_token=${accessToken}&fields=id,name`)
    const d2 = await r2.json()
    console.log('[oauth-callback] Ruta B negocios:', JSON.stringify(d2))
    for (const biz of (d2.data ?? [])) {
      const r3 = await fetch(`https://graph.facebook.com/v20.0/${biz.id}/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name`)
      const d3 = await r3.json()
      if (d3.data?.length) { wabaId = d3.data[0].id; wabaName = d3.data[0].name ?? biz.name; break }
    }
  }

  if (!wabaId) {
    const { data: cfg } = await supabase.from('config_meta').select('wa_business_account_id').eq('tenant_id', perfil.tenant_id).maybeSingle()
    if (cfg?.wa_business_account_id) {
      const r5 = await fetch(`https://graph.facebook.com/v20.0/${cfg.wa_business_account_id}?access_token=${accessToken}&fields=id,name`)
      const d5 = await r5.json()
      console.log('[oauth-callback] Ruta C (existing):', JSON.stringify(d5))
      if (d5.id) { wabaId = d5.id; wabaName = d5.name ?? '' }
    }
  }

  if (!wabaId) {
    const r6 = await fetch(`https://graph.facebook.com/v20.0/me?fields=whatsapp_business_accounts%7Bid%2Cname%7D&access_token=${accessToken}`)
    const d6 = await r6.json()
    console.log('[oauth-callback] Ruta D nested:', JSON.stringify(d6))
    if (d6.whatsapp_business_accounts?.data?.length) {
      wabaId   = d6.whatsapp_business_accounts.data[0].id
      wabaName = d6.whatsapp_business_accounts.data[0].name ?? ''
    }
  }

  if (!wabaId) {
    console.error('[oauth-callback] WABA no encontrado para tenant', perfil.tenant_id)
    return popupComplete(request.nextUrl, { success: 'false', error: 'sin_waba' })
  }

  // ── Números de WhatsApp ──────────────────────────────────────────────────────
  const r4 = await fetch(`https://graph.facebook.com/v20.0/${wabaId}/phone_numbers?access_token=${accessToken}&fields=id,display_phone_number,verified_name`)
  const d4 = await r4.json()
  console.log('[oauth-callback] Números:', JSON.stringify(d4))
  const phones: Array<{ id: string; display_phone_number: string; verified_name: string }> = d4.data ?? []

  if (phones.length === 0) {
    return popupComplete(request.nextUrl, { success: 'false', error: 'sin_numeros' })
  }

  // ── Suscribir WABA al webhook ────────────────────────────────────────────────
  await fetch(
    `https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps?access_token=${accessToken}&subscribed_fields=messages,message_template_status_update`,
    { method: 'POST' }
  )

  // ── Páginas de Facebook + Instagram vinculado ────────────────────────────────
  type IgAccount = { id: string; name?: string; username?: string }
  type Page      = { id: string; name: string; access_token: string; instagram: IgAccount | null }

  let pages: Page[] = []
  try {
    const pRes  = await fetch(`https://graph.facebook.com/v20.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,instagram_business_account{id,name,username}&limit=20`)
    const pData = await pRes.json()
    console.log('[oauth-callback] Páginas:', JSON.stringify(pData))
    pages = (pData.data ?? []).map((p: { id: string; name: string; access_token: string; instagram_business_account?: IgAccount }) => ({
      id:            p.id,
      name:          p.name,
      access_token:  p.access_token,
      instagram:     p.instagram_business_account ?? null,
    }))
  } catch (e) { console.error('[oauth-callback] Error páginas:', e) }

  // ── Siempre mostrar popup-select para que el usuario confirme ────────────────
  const selectUrl = new URL('/admin/mensajes/popup-select', request.url)
  selectUrl.searchParams.set('waba_id',   wabaId)
  selectUrl.searchParams.set('waba_name', encodeURIComponent(wabaName))
  selectUrl.searchParams.set('phones',    encodeURIComponent(JSON.stringify(phones)))
  selectUrl.searchParams.set('pages',     encodeURIComponent(JSON.stringify(pages)))
  selectUrl.searchParams.set('token',     accessToken)
  return NextResponse.redirect(selectUrl)
}
