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
    .select('instagram_access_token_enc, estado_instagram')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (cfg?.estado_instagram !== 'conectado' || !cfg?.instagram_access_token_enc) {
    return NextResponse.json({ error: 'Instagram no conectado' }, { status: 400 })
  }

  let pageToken = cfg.instagram_access_token_enc
  try { const { decrypt } = await import('@/lib/crypto'); pageToken = decrypt(cfg.instagram_access_token_enc) } catch { /* dev */ }

  // ── 1. Buscar convs de Instagram sin nombre en nuestra DB ─────────────────
  const { data: convs } = await admin
    .from('conversaciones')
    .select('id, canal_contact_id, cliente_id, clientes(id, nombre)')
    .eq('tenant_id', tenantId)
    .eq('canal', 'instagram')
    .order('created_at', { ascending: false })
    .limit(500)

  if (!convs?.length) return NextResponse.json({ updated: 0, skipped: 0 })

  const needsUpdate = (convs as ConvRow[]).filter(c => !normalizeCliente(c.clientes)?.nombre)
  if (!needsUpdate.length) return NextResponse.json({ updated: 0, skipped: convs.length })

  // Agrupar por IGSID para no duplicar llamadas
  const igsidToConvIds = new Map<string, string[]>()
  for (const c of needsUpdate) {
    const list = igsidToConvIds.get(c.canal_contact_id) ?? []
    list.push(c.id)
    igsidToConvIds.set(c.canal_contact_id, list)
  }

  let updated = 0

  for (const [igsid, convIds] of igsidToConvIds) {
    try {
      // GET /v20.0/{igsid}?fields=name,username — disponible para usuarios que hayan enviado DMs
      const r = await fetch(`https://graph.facebook.com/v20.0/${igsid}?fields=name,username&access_token=${pageToken}`)
      const profile = await r.json() as { name?: string; username?: string; error?: { message?: string } }
      console.log(`[sync-instagram] igsid=${igsid} ok=${r.ok} name=${profile.name ?? 'null'} username=${profile.username ?? 'null'} err=${profile.error?.message ?? 'none'}`)

      // Usar nombre completo si existe, si no username con @
      const nombre = profile.name ?? (profile.username ? `@${profile.username}` : null)

      // Buscar o crear cliente
      const { data: existente } = await admin
        .from('clientes').select('id')
        .eq('tenant_id', tenantId).eq('instagram_id', igsid).maybeSingle()

      let clienteId: string | null = existente?.id ?? null

      if (nombre) {
        if (existente) {
          await admin.from('clientes').update({ nombre }).eq('id', existente.id)
          clienteId = existente.id
        } else {
          const { data: nuevo } = await admin
            .from('clientes')
            .insert({ tenant_id: tenantId, nombre, instagram_id: igsid })
            .select('id').single()
          clienteId = nuevo?.id ?? null
        }
      } else if (!existente) {
        // Crear cliente sin nombre para al menos vincular la conversación
        const { data: nuevo } = await admin
          .from('clientes')
          .insert({ tenant_id: tenantId, nombre: null, instagram_id: igsid })
          .select('id').single()
        clienteId = nuevo?.id ?? null
      }

      // Vincular cliente a las conversaciones
      if (clienteId) {
        for (const convId of convIds) {
          const conv = needsUpdate.find(c => c.id === convId)
          if (!conv?.cliente_id) {
            await admin.from('conversaciones').update({ cliente_id: clienteId }).eq('id', convId)
          }
        }
        if (nombre) updated += convIds.length
      }
    } catch {
      // continuar con el siguiente IGSID
    }
  }

  console.log(`[sync-instagram] actualizado: ${updated} convs`)
  return NextResponse.json({ updated, skipped: convs.length - needsUpdate.length })
}
