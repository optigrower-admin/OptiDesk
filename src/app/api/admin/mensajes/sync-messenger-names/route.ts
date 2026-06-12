import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type ConvRow = {
  id: string
  canal_contact_id: string
  cliente_id: string | null
  clientes: { id: string; nombre: string | null } | { id: string; nombre: string | null }[] | null
}

function normalizeCliente(raw: ConvRow['clientes']) {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export async function POST(req: NextRequest) {
  void req
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const tenantId = perfil.tenant_id

  const { data: cfg } = await admin
    .from('config_meta')
    .select('messenger_access_token_enc, messenger_page_id, estado_messenger')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (cfg?.estado_messenger !== 'conectado' || !cfg?.messenger_access_token_enc) {
    return NextResponse.json({ error: 'Messenger no conectado' }, { status: 400 })
  }

  let pageToken = cfg.messenger_access_token_enc
  try { const { decrypt } = await import('@/lib/crypto'); pageToken = decrypt(cfg.messenger_access_token_enc) } catch { /* dev */ }

  const pageId = cfg.messenger_page_id ?? ''

  // ── 1. Obtener nombres desde la API de conversaciones de la página ───────────
  // GET /me/conversations?fields=participants{id,name} es más fiable que PSID endpoint
  const nameByPsid = new Map<string, string>()
  try {
    let nextUrl: string | null =
      `https://graph.facebook.com/v20.0/me/conversations?fields=participants%7Bid%2Cname%7D&limit=200&access_token=${pageToken}`

    while (nextUrl) {
      const r = await fetch(nextUrl)
      const d = await r.json() as {
        data?: Array<{ participants?: { data?: Array<{ id: string; name: string }> } }>
        paging?: { next?: string }
        error?: { message: string }
      }
      if (!r.ok || d.error) {
        console.log('[sync-messenger] conversations API error:', d.error?.message)
        break
      }
      for (const fbConv of d.data ?? []) {
        for (const p of fbConv.participants?.data ?? []) {
          if (p.id !== pageId && p.name && !nameByPsid.has(p.id)) {
            nameByPsid.set(p.id, p.name)
          }
        }
      }
      nextUrl = d.paging?.next ?? null
    }
  } catch (e) {
    console.log('[sync-messenger] conversations API exception:', e)
  }

  console.log(`[sync-messenger] nombres obtenidos de Meta: ${nameByPsid.size}`)

  // ── 2. Buscar convs sin nombre en nuestra DB ──────────────────────────────────
  const { data: convs } = await admin
    .from('conversaciones')
    .select('id, canal_contact_id, cliente_id, clientes(id, nombre)')
    .eq('tenant_id', tenantId)
    .eq('canal', 'messenger')
    .order('created_at', { ascending: false })
    .limit(500)

  if (!convs?.length) return NextResponse.json({ updated: 0, skipped: 0 })

  const needsUpdate = (convs as ConvRow[]).filter(c => !normalizeCliente(c.clientes)?.nombre)
  if (!needsUpdate.length) return NextResponse.json({ updated: 0, skipped: convs.length })

  // Agrupar por PSID para no crear duplicados
  const psidToConvIds = new Map<string, string[]>()
  for (const c of needsUpdate) {
    const list = psidToConvIds.get(c.canal_contact_id) ?? []
    list.push(c.id)
    psidToConvIds.set(c.canal_contact_id, list)
  }

  let updated = 0

  for (const [psid, convIds] of psidToConvIds) {
    try {
      // Obtener nombre: primero del mapa de la página, después PSID endpoint como fallback
      let nombre = nameByPsid.get(psid) ?? null

      if (!nombre) {
        // Fallback: endpoint individual por PSID
        const r = await fetch(`https://graph.facebook.com/v20.0/${psid}?fields=name&access_token=${pageToken}`)
        const profile = await r.json() as { name?: string; error?: { message?: string } }
        console.log(`[sync-messenger] psid=${psid} ok=${r.ok} name=${profile.name ?? 'null'} err=${profile.error?.message ?? 'none'}`)
        nombre = profile.name ?? null
      }

      // Buscar o crear cliente
      const { data: existente } = await admin
        .from('clientes').select('id')
        .eq('tenant_id', tenantId).eq('messenger_id', psid).maybeSingle()

      let clienteId: string | null = existente?.id ?? null

      if (nombre) {
        if (existente) {
          await admin.from('clientes').update({ nombre }).eq('id', existente.id)
          clienteId = existente.id
        } else {
          const { data: nuevo } = await admin
            .from('clientes')
            .insert({ tenant_id: tenantId, nombre, messenger_id: psid })
            .select('id').single()
          clienteId = nuevo?.id ?? null
        }
      }

      // Vincular cliente a las conversaciones
      if (clienteId) {
        for (const convId of convIds) {
          const conv = needsUpdate.find(c => c.id === convId)
          if (!conv?.cliente_id) {
            await admin.from('conversaciones').update({ cliente_id: clienteId }).eq('id', convId)
          }
        }
        updated += convIds.length
      }
    } catch {
      // continuar con el siguiente PSID
    }
  }

  console.log(`[sync-messenger] actualizado: ${updated} convs`)
  return NextResponse.json({ updated, skipped: convs.length - needsUpdate.length })
}
