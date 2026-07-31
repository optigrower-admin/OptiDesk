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

interface PlantillaRow {
  id: string
  tenant_id: string
  meta_template_name: string | null
  categoria_meta: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  idioma: string
  cuerpo: string
  variables: string[]
  tipo_header: 'texto' | 'imagen' | 'documento' | 'video' | 'ninguno' | null
  header_texto: string | null
  header_contenido: string | null
  footer_texto: string | null
  botones: unknown[]
}

/** Convierte {{nombre}} → {{1}} en orden de aparición, para el formato de Meta. */
function cuerpoAFormatoMeta(cuerpo: string, variables: string[]): { texto: string; ejemplo: string[] } {
  let texto = cuerpo
  const ejemplo: string[] = []
  variables.forEach((v, i) => {
    texto = texto.split(`{{${v}}}`).join(`{{${i + 1}}}`)
    ejemplo.push(v)
  })
  return { texto, ejemplo }
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
    .select('id, tenant_id, meta_template_name, categoria_meta, idioma, cuerpo, variables, tipo_header, header_texto, header_contenido, footer_texto, botones')
    .eq('id', plantilla_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })

  const p = plantilla as unknown as PlantillaRow
  if (!p.meta_template_name?.trim()) {
    return NextResponse.json({ error: 'Falta el "Nombre en Meta" de la plantilla' }, { status: 400 })
  }

  const { data: cfg } = await admin
    .from('config_meta')
    .select('wa_business_account_id, wa_access_token_enc')
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()

  if (!cfg?.wa_business_account_id || !cfg?.wa_access_token_enc) {
    return NextResponse.json({ error: 'Meta no está conectado. Configúralo en Conexión Meta.' }, { status: 400 })
  }

  const token = await decryptToken(cfg.wa_access_token_enc)

  // ── Armar components ──
  const components: Record<string, unknown>[] = []

  if (p.tipo_header && p.tipo_header !== 'ninguno') {
    if (p.tipo_header === 'texto') {
      if (p.header_texto?.trim()) {
        components.push({ type: 'HEADER', format: 'TEXT', text: p.header_texto.trim() })
      }
    } else {
      const format = p.tipo_header === 'imagen' ? 'IMAGE' : p.tipo_header === 'video' ? 'VIDEO' : 'DOCUMENT'
      if (!p.header_contenido?.trim()) {
        return NextResponse.json({ error: `Falta el contenido del header (${format.toLowerCase()}).` }, { status: 400 })
      }
      components.push({ type: 'HEADER', format, example: { header_handle: [p.header_contenido.trim()] } })
    }
  }

  const { texto: cuerpoMeta, ejemplo } = cuerpoAFormatoMeta(p.cuerpo, p.variables ?? [])
  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: cuerpoMeta }
  if (ejemplo.length > 0) bodyComponent.example = { body_text: [ejemplo] }
  components.push(bodyComponent)

  if (p.footer_texto?.trim()) {
    components.push({ type: 'FOOTER', text: p.footer_texto.trim() })
  }

  if (Array.isArray(p.botones) && p.botones.length > 0) {
    components.push({ type: 'BUTTONS', buttons: p.botones })
  }

  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.wa_business_account_id}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: p.meta_template_name,
      category: p.categoria_meta,
      language: p.idioma,
      components,
    }),
  })
  const result = await r.json()

  if (!r.ok) {
    const metaMsg = result?.error?.error_user_msg || result?.error?.message || 'Error al enviar la plantilla a Meta'
    return NextResponse.json({ error: metaMsg, code: 'META_ERROR' }, { status: 422 })
  }

  const nuevoEstado = String(result.status ?? 'PENDING').toLowerCase() === 'approved' ? 'aprobada' : 'pendiente'

  await admin.from('plantillas_mensajes').update({
    meta_template_id: result.id ?? null,
    meta_status: nuevoEstado,
    meta_rechazo_motivo: null,
    updated_at: new Date().toISOString(),
  }).eq('id', p.id)

  return NextResponse.json({ ok: true, meta_template_id: result.id, meta_status: nuevoEstado })
}
