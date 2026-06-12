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

type WabaEntry  = { id: string; name: string; biz_name?: string }
type PhoneEntry = { id: string; display_phone_number: string; verified_name: string; waba_id: string; waba_name: string }

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

  // ── Token: corto → largo (60 días) ──────────────────────────────────────────
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

  // ── Recolectar TODOS los WABAs (todos los Business Managers) ─────────────────
  const wabaMap = new Map<string, WabaEntry>()

  const addWabas = (list: Array<{ id: string; name?: string }>, bizName?: string) => {
    for (const w of list) {
      if (!wabaMap.has(w.id)) wabaMap.set(w.id, { id: w.id, name: w.name ?? '', biz_name: bizName })
    }
  }

  // Ruta A: WABAs directos del usuario
  const r1 = await fetch(`https://graph.facebook.com/v20.0/me/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name&limit=50`)
  const d1 = await r1.json()
  console.log('[oauth-callback] Ruta A (WABAs directos):', JSON.stringify(d1))
  addWabas(d1.data ?? [])

  // Ruta B: todos los Business Managers del usuario y sus WABAs
  const r2 = await fetch(`https://graph.facebook.com/v20.0/me/businesses?access_token=${accessToken}&fields=id,name&limit=50`)
  const d2 = await r2.json()
  console.log('[oauth-callback] Ruta B (negocios):', JSON.stringify(d2))
  for (const biz of (d2.data ?? [])) {
    const r3 = await fetch(`https://graph.facebook.com/v20.0/${biz.id}/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name&limit=50`)
    const d3 = await r3.json()
    console.log(`[oauth-callback] Ruta B WABAs de ${biz.name}:`, JSON.stringify(d3))
    addWabas(d3.data ?? [], biz.name)
  }

  // Ruta C: WABA ya guardado para este tenant (re-autenticación)
  if (wabaMap.size === 0) {
    const { data: cfg } = await supabase.from('config_meta').select('wa_business_account_id').eq('tenant_id', perfil.tenant_id).maybeSingle()
    if (cfg?.wa_business_account_id) {
      const r5 = await fetch(`https://graph.facebook.com/v20.0/${cfg.wa_business_account_id}?access_token=${accessToken}&fields=id,name`)
      const d5 = await r5.json()
      console.log('[oauth-callback] Ruta C (existing):', JSON.stringify(d5))
      if (d5.id) addWabas([d5])
    }
  }

  if (wabaMap.size === 0) {
    console.error('[oauth-callback] Sin WABAs para tenant', perfil.tenant_id)
    return popupComplete(request.nextUrl, { success: 'false', error: 'sin_waba' })
  }

  // ── Para cada WABA, obtener TODOS sus números ───────────────────────────────
  const allPhones: PhoneEntry[] = []

  for (const waba of wabaMap.values()) {
    const r4 = await fetch(
      `https://graph.facebook.com/v20.0/${waba.id}/phone_numbers?access_token=${accessToken}&fields=id,display_phone_number,verified_name&limit=50`
    )
    const d4 = await r4.json()
    const wabaLabel = waba.name || waba.biz_name || `WABA ${waba.id}`
    console.log(`[oauth-callback] Números WABA ${waba.id} (${wabaLabel}):`, JSON.stringify(d4))
    for (const p of (d4.data ?? [])) {
      allPhones.push({
        id:                   p.id,
        display_phone_number: p.display_phone_number,
        verified_name:        p.verified_name ?? '',
        waba_id:              waba.id,
        waba_name:            wabaLabel,
      })
    }
  }

  if (allPhones.length === 0) {
    return popupComplete(request.nextUrl, { success: 'false', error: 'sin_numeros' })
  }

  // ── Ir siempre al popup-select para que el usuario confirme ─────────────────
  const selectUrl = new URL('/admin/mensajes/popup-select', request.url)
  selectUrl.searchParams.set('phones', encodeURIComponent(JSON.stringify(allPhones)))
  selectUrl.searchParams.set('token',  accessToken)
  return NextResponse.redirect(selectUrl)
}
