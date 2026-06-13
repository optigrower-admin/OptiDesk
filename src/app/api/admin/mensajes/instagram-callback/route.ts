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

  // Intercambiar código → token largo
  const t1 = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`)
  const d1 = await t1.json()
  if (!d1.access_token) return popup(request.nextUrl, { success: 'false', channel: 'instagram', error: 'token_error' })

  const t2 = await fetch(`https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${d1.access_token}`)
  const d2    = await t2.json()
  const userToken = d2.access_token ?? d1.access_token

  // Obtener páginas con su token de página Y la cuenta de Instagram vinculada
  const r = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?access_token=${userToken}&fields=id,name,access_token,instagram_business_account{id,name,username}&limit=50`
  )
  const d = await r.json()
  console.log('[instagram-callback] Páginas:', JSON.stringify(d))

  type IgAccount = { id: string; name: string; username?: string; page_id: string; page_token: string }
  const igAccounts: IgAccount[] = []

  for (const page of (d.data ?? [])) {
    if (page.instagram_business_account) {
      igAccounts.push({
        id:         page.instagram_business_account.id,
        name:       page.instagram_business_account.name ?? page.name,
        username:   page.instagram_business_account.username,
        page_id:    page.id,
        page_token: page.access_token,   // token de página, no de usuario
      })
    }
  }

  if (igAccounts.length === 0)
    return popup(request.nextUrl, { success: 'false', channel: 'instagram', error: 'sin_instagram' })

  if (igAccounts.length > 1) {
    const url = new URL('/admin/mensajes/popup-select-instagram', request.url)
    url.searchParams.set('accounts', encodeURIComponent(JSON.stringify(igAccounts)))
    return NextResponse.redirect(url)
  }

  const ig = igAccounts[0]
  await guardarInstagram(perfil.tenant_id, ig.id, ig.page_id, ig.page_token)
  return popup(request.nextUrl, { success: 'true', channel: 'instagram', detail: ig.username ? `@${ig.username}` : ig.name })
}

async function guardarInstagram(tenantId: string, igId: string, pageId: string, pageToken: string) {
  let tokenEnc = pageToken
  try { const { encrypt } = await import('@/lib/crypto'); tokenEnc = encrypt(pageToken) } catch { /* dev */ }

  const admin = createAdminClient()
  await admin.from('config_meta').upsert({
    tenant_id:                  tenantId,
    instagram_account_id:       igId,
    instagram_access_token_enc: tokenEnc,   // se guarda el token de PÁGINA
    estado_instagram:           'conectado',
    updated_at:                 new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  // Suscribir la página a los eventos de Instagram DM
  try {
    await fetch(
      `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?access_token=${pageToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed_fields: 'messages,instagram_manage_messages' }),
      }
    )
  } catch { /* no crítico */ }
}
