import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const APP_ID       = process.env.NEXT_PUBLIC_META_APP_ID!
const APP_SECRET   = process.env.META_APP_SECRET!
const REDIRECT_URI = 'https://opti-desk.vercel.app/api/admin/mensajes/messenger-callback'

function popup(base: URL, params: Record<string, string>) {
  const url = new URL('/admin/mensajes/popup-complete', base)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const sp    = request.nextUrl.searchParams
  const code  = sp.get('code')
  const error = sp.get('error')

  if (error || !code) return popup(request.nextUrl, { success: 'false', channel: 'messenger', error: error ?? 'no_code' })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return popup(request.nextUrl, { success: 'false', channel: 'messenger', error: 'sin_perfil' })

  // Intercambiar código → token largo
  const t1 = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${code}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`)
  const d1 = await t1.json()
  if (!d1.access_token) return popup(request.nextUrl, { success: 'false', channel: 'messenger', error: 'token_error' })

  const t2 = await fetch(`https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${d1.access_token}`)
  const d2     = await t2.json()
  const token  = d2.access_token ?? d1.access_token

  // Obtener páginas del usuario
  const r = await fetch(`https://graph.facebook.com/v20.0/me/accounts?access_token=${token}&fields=id,name,access_token&limit=50`)
  const d = await r.json()
  console.log('[messenger-callback] Páginas:', JSON.stringify(d))

  const pages = d.data ?? []
  if (pages.length === 0) return popup(request.nextUrl, { success: 'false', channel: 'messenger', error: 'sin_paginas' })

  // Si hay múltiples páginas → ir a popup-select-pages
  if (pages.length > 1) {
    const url = new URL('/admin/mensajes/popup-select-pages', request.url)
    url.searchParams.set('pages', encodeURIComponent(JSON.stringify(pages)))
    url.searchParams.set('token', token)
    return NextResponse.redirect(url)
  }

  // Una sola página → guardar automáticamente
  const page = pages[0]
  await guardarMessenger(perfil.tenant_id, page.id, page.access_token)
  return popup(request.nextUrl, { success: 'true', channel: 'messenger', detail: page.name })
}

async function guardarMessenger(tenantId: string, pageId: string, pageToken: string) {
  let tokenEnc = pageToken
  try { const { encrypt } = await import('@/lib/crypto'); tokenEnc = encrypt(pageToken) } catch { /* dev */ }

  const admin = createAdminClient()
  await admin.from('config_meta').upsert({
    tenant_id:                  tenantId,
    messenger_page_id:          pageId,
    messenger_access_token_enc: tokenEnc,
    estado_messenger:           'conectado',
    updated_at:                 new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  // Suscribir la página al webhook del app para recibir eventos messages
  try {
    await fetch(
      `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps?access_token=${pageToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads,feed' }),
      }
    )
  } catch { /* no crítico — se puede hacer manualmente en Meta Developer Console */ }
}
