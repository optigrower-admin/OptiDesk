import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { ig_id, page_id, page_token } = await req.json()
  if (!ig_id || !page_id || !page_token)
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  let tokenEnc = page_token
  try { const { encrypt } = await import('@/lib/crypto'); tokenEnc = encrypt(page_token) } catch { /* dev */ }

  const admin = createAdminClient()
  await admin.from('config_meta').upsert({
    tenant_id:                  perfil.tenant_id,
    instagram_account_id:       ig_id,
    instagram_access_token_enc: tokenEnc,
    estado_instagram:           'conectado',
    updated_at:                 new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  // Suscribir la página a eventos de Instagram
  try {
    await fetch(
      `https://graph.facebook.com/v20.0/${page_id}/subscribed_apps?access_token=${page_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed_fields: 'messages,instagram_manage_messages' }),
      }
    )
  } catch { /* no crítico */ }

  return NextResponse.json({ ok: true })
}
