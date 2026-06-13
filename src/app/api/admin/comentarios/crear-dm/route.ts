import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function dec(enc: string): Promise<string> {
  try { const { decrypt } = await import('@/lib/crypto'); return decrypt(enc) } catch { return enc }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json() as { comentario_id: string; mensaje: string }
  const { comentario_id, mensaje } = body
  if (!comentario_id || !mensaje?.trim())
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const admin = createAdminClient()
  const tenantId = perfil.tenant_id

  const { data: comentario } = await admin.from('comentarios')
    .select('*, publicaciones(tenant_id)')
    .eq('id', comentario_id)
    .maybeSingle()

  const pub = comentario?.publicaciones as Record<string, string> | null
  if (!comentario || pub?.tenant_id !== tenantId)
    return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 })

  const { data: cfg } = await admin.from('config_meta')
    .select('messenger_access_token_enc, messenger_page_id, instagram_access_token_enc')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!cfg) return NextResponse.json({ error: 'Sin configuración Meta' }, { status: 400 })

  let canalDm: 'messenger' | 'instagram' | null = null
  let canalContactId: string | null = null
  let metaMsgId: string | null = null
  let estadoEnvio = 'enviado'

  if (comentario.canal === 'facebook' && cfg.messenger_access_token_enc && cfg.messenger_page_id) {
    const token  = await dec(cfg.messenger_access_token_enc)
    const pageId = cfg.messenger_page_id

    const r = await fetch(
      `https://graph.facebook.com/v20.0/${pageId}/private_replies?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: comentario.comentario_id, message: mensaje }),
      }
    )
    const result = await r.json() as { recipient_id?: string; message_id?: string; error?: { message: string } }
    if (!r.ok || result.error) {
      return NextResponse.json({ error: result.error?.message ?? 'Error al enviar DM por Facebook' }, { status: 502 })
    }
    canalDm        = 'messenger'
    canalContactId = result.recipient_id ?? comentario.autor_id
    metaMsgId      = result.message_id ?? null

  } else if (comentario.canal === 'instagram' && cfg.instagram_access_token_enc) {
    const token = await dec(cfg.instagram_access_token_enc)
    const r = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: comentario.autor_id },
          message: { text: mensaje },
        }),
      }
    )
    const result = await r.json() as { message_id?: string; error?: { message: string } }
    if (!r.ok || result.error) estadoEnvio = 'fallido'
    canalDm        = 'instagram'
    canalContactId = comentario.autor_id
    metaMsgId      = result.message_id ?? null
  }

  if (!canalDm || !canalContactId)
    return NextResponse.json({ error: 'Canal no compatible' }, { status: 400 })

  // Find existing open conversation
  let { data: conv } = await admin.from('conversaciones')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('canal', canalDm)
    .eq('canal_contact_id', canalContactId)
    .in('estado', ['abierta', 'pendiente'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conv) {
    // Find or create the client record
    let clienteId: string | null = null

    if (canalDm === 'messenger') {
      const { data: existente } = await admin.from('clientes').select('id')
        .eq('tenant_id', tenantId).eq('messenger_id', canalContactId).maybeSingle()
      if (existente) {
        clienteId = existente.id
      } else {
        const nombre = comentario.autor_nombre ?? (comentario.autor_username ? `@${comentario.autor_username}` : null)
        const { data: nuevo } = await admin.from('clientes')
          .insert({ tenant_id: tenantId, nombre, messenger_id: canalContactId })
          .select('id').single()
        clienteId = nuevo?.id ?? null
      }
    } else {
      const { data: existente } = await admin.from('clientes').select('id')
        .eq('tenant_id', tenantId).eq('instagram_id', canalContactId).maybeSingle()
      if (existente) {
        clienteId = existente.id
      } else {
        const nombre = comentario.autor_nombre ?? (comentario.autor_username ? `@${comentario.autor_username}` : null)
        const { data: nuevo } = await admin.from('clientes')
          .insert({ tenant_id: tenantId, nombre, instagram_id: canalContactId })
          .select('id').single()
        clienteId = nuevo?.id ?? null
      }
    }

    const { data: nuevaConv } = await admin.from('conversaciones').insert({
      tenant_id:        tenantId,
      canal:            canalDm,
      canal_contact_id: canalContactId,
      assigned_to:      perfil.id,
      cliente_id:       clienteId,
      estado:           'abierta',
    }).select('id').single()
    conv = nuevaConv
  }

  if (!conv) return NextResponse.json({ error: 'No se pudo crear la conversación' }, { status: 500 })

  const now = new Date().toISOString()

  await admin.from('mensajes').insert({
    conversacion_id:  conv.id,
    tenant_id:        tenantId,
    direccion:        'saliente',
    tipo:             'texto',
    contenido:        mensaje,
    enviado_por:      perfil.id,
    meta_message_id:  metaMsgId,
    estado_envio:     estadoEnvio,
    leido_por_asesor: true,
  })

  await admin.from('conversaciones').update({
    ultimo_mensaje_at:        now,
    ultimo_mensaje_texto:     mensaje.slice(0, 100),
    ultimo_mensaje_direccion: 'saliente',
    updated_at:               now,
  }).eq('id', conv.id)

  await admin.from('comentarios').update({
    estado:          'dm_enviado',
    conversacion_id: conv.id,
    updated_at:      now,
  }).eq('id', comentario_id)

  return NextResponse.json({ ok: true, conversacion_id: conv.id })
}
