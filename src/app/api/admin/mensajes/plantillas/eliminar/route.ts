import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

const GRAPH_VERSION = 'v20.0'

async function decryptToken(enc: string): Promise<string> {
  try {
    const { decrypt } = await import('@/lib/crypto')
    return decrypt(enc)
  } catch {
    return enc
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['admin', 'gerencia', 'control_total'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { plantilla_id } = await req.json()
  if (!plantilla_id) return NextResponse.json({ error: 'Falta plantilla_id' }, { status: 400 })

  const admin = createAdminClient()

  const { data: plantilla } = await admin
    .from('plantillas_mensajes')
    .select('id, tenant_id, meta_template_id, meta_template_name')
    .eq('id', plantilla_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })

  let avisoMeta: string | null = null

  if (plantilla.meta_template_id && plantilla.meta_template_name) {
    const { data: cfg } = await admin
      .from('config_meta')
      .select('wa_business_account_id, wa_access_token_enc')
      .eq('tenant_id', perfil.tenant_id)
      .maybeSingle()

    if (cfg?.wa_business_account_id && cfg?.wa_access_token_enc) {
      const token = await decryptToken(cfg.wa_access_token_enc)
      const r = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.wa_business_account_id}/message_templates?name=${encodeURIComponent(plantilla.meta_template_name)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      )
      if (!r.ok) {
        const result = await r.json().catch(() => null)
        avisoMeta = result?.error?.error_user_msg || result?.error?.message || 'No se pudo eliminar en Meta (puede que ya no exista allá).'
      }
    }
  }

  const { error } = await admin.from('plantillas_mensajes').delete().eq('id', plantilla_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, avisoMeta })
}
