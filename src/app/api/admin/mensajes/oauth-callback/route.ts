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

type WabaEntry  = { id: string; name: string }
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

  // ── Token corto → largo (60 días) ───────────────────────────────────────────
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

  // ── Recolectar WABAs por múltiples rutas ────────────────────────────────────
  const wabaMap = new Map<string, WabaEntry>()

  const addWabas = (list: Array<{ id: string; name?: string }>) => {
    for (const w of list) if (!wabaMap.has(w.id)) wabaMap.set(w.id, { id: w.id, name: w.name ?? '' })
  }

  // Ruta A: WABAs directos del usuario
  const rA = await fetch(`https://graph.facebook.com/v20.0/me/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name&limit=50`)
  const dA = await rA.json()
  console.log('[oauth-callback] A (WABAs directos):', JSON.stringify(dA))
  addWabas(dA.data ?? [])

  // Ruta B: negocios donde el usuario es propietario/admin
  const rB = await fetch(`https://graph.facebook.com/v20.0/me/businesses?access_token=${accessToken}&fields=id,name&limit=50`)
  const dB = await rB.json()
  console.log('[oauth-callback] B (businesses):', JSON.stringify(dB))
  for (const biz of (dB.data ?? [])) {
    const r = await fetch(`https://graph.facebook.com/v20.0/${biz.id}/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name&limit=50`)
    const d = await r.json()
    addWabas(d.data ?? [])
  }

  // Ruta C: business_users → negocios donde el usuario tiene CUALQUIER rol (no solo propietario)
  const rC = await fetch(`https://graph.facebook.com/v20.0/me/business_users?access_token=${accessToken}&fields=id,business{id,name}&limit=50`)
  const dC = await rC.json()
  console.log('[oauth-callback] C (business_users):', JSON.stringify(dC))
  for (const bu of (dC.data ?? [])) {
    if (!bu.business?.id) continue
    const r = await fetch(`https://graph.facebook.com/v20.0/${bu.business.id}/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name&limit=50`)
    const d = await r.json()
    addWabas(d.data ?? [])
  }

  // Ruta D: WABA ya guardado para este tenant (re-autenticación)
  if (wabaMap.size === 0) {
    const { data: cfg } = await supabase.from('config_meta').select('wa_business_account_id').eq('tenant_id', perfil.tenant_id).maybeSingle()
    if (cfg?.wa_business_account_id) {
      const r = await fetch(`https://graph.facebook.com/v20.0/${cfg.wa_business_account_id}?access_token=${accessToken}&fields=id,name`)
      const d = await r.json()
      if (d.id) addWabas([d])
    }
  }

  // ── Obtener números de todos los WABAs ──────────────────────────────────────
  const allPhones: PhoneEntry[] = []
  for (const waba of wabaMap.values()) {
    const r = await fetch(`https://graph.facebook.com/v20.0/${waba.id}/phone_numbers?access_token=${accessToken}&fields=id,display_phone_number,verified_name&limit=50`)
    const d = await r.json()
    console.log(`[oauth-callback] Números WABA ${waba.id}:`, JSON.stringify(d))
    for (const p of (d.data ?? [])) {
      allPhones.push({
        id:                   p.id,
        display_phone_number: p.display_phone_number,
        verified_name:        p.verified_name ?? '',
        waba_id:              waba.id,
        waba_name:            waba.name || `WABA ${waba.id}`,
      })
    }
  }

  console.log(`[oauth-callback] Total WABAs: ${wabaMap.size}, Total números: ${allPhones.length}`)

  // Ir siempre a popup-select (aunque no haya números — el usuario puede buscar por ID)
  const selectUrl = new URL('/admin/mensajes/popup-select', request.url)
  selectUrl.searchParams.set('phones', encodeURIComponent(JSON.stringify(allPhones)))
  selectUrl.searchParams.set('token',  accessToken)
  return NextResponse.redirect(selectUrl)
}
