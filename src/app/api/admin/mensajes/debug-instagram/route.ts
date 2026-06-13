import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const { data: cfg } = await admin
    .from('config_meta')
    .select('instagram_access_token_enc, instagram_account_id, estado_instagram')
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()

  if (!cfg) return NextResponse.json({ error: 'Sin config_meta' })

  let token = cfg.instagram_access_token_enc ?? ''
  try { const { decrypt } = await import('@/lib/crypto'); token = decrypt(token) } catch { /* dev */ }

  const igAccountId = cfg.instagram_account_id

  // Prueba 1: /me/conversations?platform=instagram
  const r1 = await fetch(
    `https://graph.facebook.com/v20.0/me/conversations?platform=instagram&fields=participants%7Bid%2Cname%2Cusername%7D&limit=5&access_token=${token}`
  )
  const d1 = await r1.json()

  // Prueba 2: /me (para ver qué identidad tiene el token)
  const r2 = await fetch(`https://graph.facebook.com/v20.0/me?fields=id,name&access_token=${token}`)
  const d2 = await r2.json()

  // Prueba 3: /{ig_account_id}/conversations?platform=instagram
  const r3 = igAccountId ? await fetch(
    `https://graph.facebook.com/v20.0/${igAccountId}/conversations?platform=instagram&fields=participants%7Bid%2Cname%2Cusername%7D&limit=5&access_token=${token}`
  ) : null
  const d3 = r3 ? await r3.json() : 'sin instagram_account_id'

  // Prueba 4: verificar permisos del token
  const r4 = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`)
  const d4 = await r4.json()

  // Prueba 5: endpoint directo por IGSID — tomamos el primer IGSID de nuestras convs
  const { data: primerConv } = await admin
    .from('conversaciones')
    .select('canal_contact_id')
    .eq('tenant_id', perfil.tenant_id)
    .eq('canal', 'instagram')
    .limit(1)
    .maybeSingle()

  const igsid = primerConv?.canal_contact_id ?? null
  let d5: unknown = 'sin conversaciones instagram en DB'
  let s5: number | string = 'N/A'
  if (igsid) {
    const r5 = await fetch(`https://graph.facebook.com/v20.0/${igsid}?fields=name,username,profile_pic&access_token=${token}`)
    d5 = await r5.json()
    s5 = r5.status
  }

  // Prueba 6: /me/conversations sin platform (para ver si la página tiene ALGUNA conv)
  const r6 = await fetch(`https://graph.facebook.com/v20.0/me/conversations?fields=participants%7Bid%2Cname%7D&limit=3&access_token=${token}`)
  const d6 = await r6.json()

  return NextResponse.json({
    config: {
      estado_instagram: cfg.estado_instagram,
      instagram_account_id: igAccountId,
      page_id_del_token: d4?.data?.profile_id ?? 'ver prueba4',
      token_primeros_10: token.slice(0, 10) + '...',
    },
    prueba1_me_conversations_instagram: { status: r1.status, body: d1 },
    prueba2_me_identity: { status: r2.status, body: d2 },
    prueba3_ig_account_conversations: { status: r3?.status ?? 'N/A', body: d3 },
    prueba4_token_permisos: { status: r4.status, body: d4 },
    prueba5_igsid_directo: { igsid, status: s5, body: d5 },
    prueba6_me_conversations_sin_platform: { status: r6.status, body: d6 },
  })
}
