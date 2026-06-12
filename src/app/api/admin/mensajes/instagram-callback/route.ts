import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const APP_ID       = process.env.NEXT_PUBLIC_META_APP_ID!
const APP_SECRET   = process.env.META_APP_SECRET!
const REDIRECT_URI = 'https://opti-desk.vercel.app/api/admin/mensajes/instagram-callback'

function popup(base: URL, params: Record<string, string>) {
  const url = new URL('/admin/mensajes/popup-complete', base)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const sp    = request.nextUrl.searchParams
  const code  = sp.get('code')
  const error = sp.get('error')

  if (error || !code) return popup(request.nextUrl, { success: 'false', channel: 'instagram', error: error ?? 'no_code' })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return popup(request.nextUrl, { success: 'false', channel: 'instagram', error: 'sin_perfil' })

  // Token largo
  const t1 = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`)
  const d1 = await t1.json()
  if (!d1.access_token) return popup(request.nextUrl, { success: 'false', channel: 'instagram', error: 'token_error' })

  const t2 = await fetch(`https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${d1.access_token}`)
  const d2    = await t2.json()
  const token = d2.access_token ?? d1.access_token

  // Buscar cuentas de Instagram via páginas vinculadas
  const r = await fetch(`https://graph.facebook.com/v20.0/me/accounts?access_token=${token}&fields=id,name,instagram_business_account{id,name,username}&limit=50`)
  const d = await r.json()
  console.log('[instagram-callback] Páginas con IG:', JSON.stringify(d))

  type IgPage = { id: string; name: string; username?: string }
  const igAccounts: IgPage[] = []
  for (const page of (d.data ?? [])) {
    if (page.instagram_business_account) {
      igAccounts.push({
        id:       page.instagram_business_account.id,
        name:     page.instagram_business_account.name ?? page.name,
        username: page.instagram_business_account.username,
      })
    }
  }

  if (igAccounts.length === 0) return popup(request.nextUrl, { success: 'false', channel: 'instagram', error: 'sin_instagram' })

  if (igAccounts.length > 1) {
    const url = new URL('/admin/mensajes/popup-select-instagram', request.url)
    url.searchParams.set('accounts', encodeURIComponent(JSON.stringify(igAccounts)))
    url.searchParams.set('token', token)
    return NextResponse.redirect(url)
  }

  const ig = igAccounts[0]
  await guardarInstagram(perfil.tenant_id, ig.id, token)
  return popup(request.nextUrl, { success: 'true', channel: 'instagram', detail: ig.username ?? ig.name })
}

async function guardarInstagram(tenantId: string, igId: string, token: string) {
  let tokenEnc = token
  try { const { encrypt } = await import('@/lib/crypto'); tokenEnc = encrypt(token) } catch { /* dev */ }

  const admin = createAdminClient()
  await admin.from('config_meta').upsert({
    tenant_id:                  tenantId,
    instagram_account_id:       igId,
    instagram_access_token_enc: tokenEnc,
    estado_instagram:           'conectado',
    updated_at:                 new Date().toISOString(),
  }, { onConflict: 'tenant_id' })
}
