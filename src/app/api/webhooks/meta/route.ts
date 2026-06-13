import { createAdminClient } from '@/lib/supabase/admin'
import { procesarMensajeMeta } from '@/lib/mensajeria/webhook-processor'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET — verificación del webhook por Meta (token a nivel plataforma)
export async function GET(request: NextRequest) {
  const sp        = request.nextUrl.searchParams
  const mode      = sp.get('hub.mode')
  const token     = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')

  if (mode !== 'subscribe') return new NextResponse('Forbidden', { status: 403 })

  const platformToken = process.env.META_WEBHOOK_VERIFY_TOKEN
  if (platformToken && token === platformToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    })
  }

  // Fallback: buscar en todos los tenants (compatibilidad con config manual)
  const admin = createAdminClient()
  const { data } = await admin
    .from('config_meta')
    .select('tenant_id')
    .eq('meta_webhook_verify_token', token ?? '')
    .maybeSingle()

  if (!data?.tenant_id) return new NextResponse('Forbidden', { status: 403 })

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  })
}

// POST — mensajes entrantes: enrutar por WABA ID al tenant correcto
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch { return new NextResponse('EVENT_RECEIVED', { status: 200 }) }

  // Await garantiza que Vercel no termine la función antes de guardar el mensaje
  await procesarPorWaba(body).catch(console.error)
  return new NextResponse('EVENT_RECEIVED', { status: 200 })
}

async function procesarPorWaba(body: unknown) {
  const payload = body as Record<string, unknown>
  const entries = payload.entry as Array<Record<string, unknown>> | undefined
  if (!entries?.length) return

  const entryId = String(entries[0].id ?? '')
  const objeto  = String(payload.object ?? '')
  if (!entryId) return

  const admin = createAdminClient()
  let tenantId: string | null = null

  if (objeto === 'page') {
    // Messenger: entry.id = Page ID
    const { data } = await admin
      .from('config_meta').select('tenant_id')
      .eq('messenger_page_id', entryId).maybeSingle()
    tenantId = data?.tenant_id ?? null
  } else if (objeto === 'instagram') {
    // Instagram DM: entry.id = Instagram Business Account ID
    const { data } = await admin
      .from('config_meta').select('tenant_id')
      .eq('instagram_account_id', entryId).maybeSingle()
    tenantId = data?.tenant_id ?? null
  } else {
    // WhatsApp: entry.id = WABA ID
    const { data } = await admin
      .from('config_meta').select('tenant_id')
      .eq('wa_business_account_id', entryId).maybeSingle()
    tenantId = data?.tenant_id ?? null
  }

  if (!tenantId) return
  await procesarMensajeMeta(body, tenantId)
}
