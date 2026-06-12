import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  void req
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const tenantId = perfil.tenant_id

  // Get page token
  const { data: cfg } = await admin
    .from('config_meta')
    .select('messenger_access_token_enc, estado_messenger')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (cfg?.estado_messenger !== 'conectado' || !cfg?.messenger_access_token_enc) {
    return NextResponse.json({ error: 'Messenger no conectado' }, { status: 400 })
  }

  let pageToken = cfg.messenger_access_token_enc
  try { const { decrypt } = await import('@/lib/crypto'); pageToken = decrypt(cfg.messenger_access_token_enc) } catch { /* dev */ }

  // Find all Messenger conversations for this tenant
  const { data: convs } = await admin
    .from('conversaciones')
    .select('id, canal_contact_id, cliente_id, clientes(id, nombre)')
    .eq('tenant_id', tenantId)
    .eq('canal', 'messenger')
    .order('created_at', { ascending: false })
    .limit(500)

  if (!convs?.length) return NextResponse.json({ updated: 0, skipped: 0 })

  // Collect conversations that need a name
  type ConvRow = {
    id: string
    canal_contact_id: string
    cliente_id: string | null
    clientes: { id: string; nombre: string | null } | { id: string; nombre: string | null }[] | null
  }

  const normalize = (raw: ConvRow['clientes']) => {
    if (!raw) return null
    if (Array.isArray(raw)) return raw[0] ?? null
    return raw
  }

  const needsUpdate = (convs as ConvRow[]).filter(c => !normalize(c.clientes)?.nombre)

  if (!needsUpdate.length) return NextResponse.json({ updated: 0, skipped: convs.length })

  // Deduplicate PSIDs
  const psidToConvIds = new Map<string, string[]>()
  for (const c of needsUpdate) {
    const list = psidToConvIds.get(c.canal_contact_id) ?? []
    list.push(c.id)
    psidToConvIds.set(c.canal_contact_id, list)
  }

  let updated = 0

  for (const [psid, convIds] of psidToConvIds) {
    try {
      // Check if client already exists for this PSID
      const { data: existente } = await admin
        .from('clientes').select('id, nombre')
        .eq('tenant_id', tenantId).eq('messenger_id', psid).maybeSingle()

      let clienteId: string | null = existente?.id ?? null

      // Fetch profile name from Graph API if needed
      if (!existente?.nombre) {
        const r = await fetch(`https://graph.facebook.com/v20.0/${psid}?fields=name&access_token=${pageToken}`)
        if (r.ok) {
          const profile = await r.json() as { name?: string; error?: unknown }
          if (profile.name) {
            if (existente) {
              // Update existing client with name
              await admin.from('clientes').update({ nombre: profile.name }).eq('id', existente.id)
              clienteId = existente.id
            } else {
              // Create new client
              const { data: nuevo } = await admin
                .from('clientes')
                .insert({ tenant_id: tenantId, nombre: profile.name, messenger_id: psid })
                .select('id').single()
              clienteId = nuevo?.id ?? null
            }
          }
        }
      }

      // Link client to all conversations from this PSID
      if (clienteId) {
        for (const convId of convIds) {
          const conv = needsUpdate.find(c => c.id === convId)
          if (!conv?.cliente_id) {
            await admin.from('conversaciones').update({ cliente_id: clienteId }).eq('id', convId)
          }
        }
        updated += convIds.length
      }

      // Small delay to respect Graph API rate limits
      await new Promise(r => setTimeout(r, 80))
    } catch {
      // Skip this PSID, continue with others
    }
  }

  return NextResponse.json({ updated, skipped: convs.length - needsUpdate.length })
}
