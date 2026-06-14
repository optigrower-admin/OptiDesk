import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

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
    .from('usuarios').select('tenant_id, id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json()
  const { conversacion_id, contenido, tipo = 'texto' } = body
  if (!conversacion_id || !contenido)
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('conversaciones')
    .select('canal, canal_contact_id, tenant_id')
    .eq('id', conversacion_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  const { data: cfg } = await admin
    .from('config_meta')
    .select('wa_phone_number_id, wa_access_token_enc, messenger_access_token_enc, instagram_access_token_enc, instagram_account_id, mensajes_iniciados_hoy, limite_diario_wa, negocio_verificado, limite_reset_at')
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()

  // ── Consultar último mensaje entrante (una sola vez) ─────────────────────────
  const { data: lastEntrante } = await admin
    .from('mensajes')
    .select('created_at')
    .eq('conversacion_id', conversacion_id)
    .eq('direccion', 'entrante')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const msDesdeUltimo = lastEntrante
    ? Date.now() - new Date(lastEntrante.created_at).getTime()
    : Infinity

  // ── Validaciones previas al envío ────────────────────────────────────────────
  if ((conv.canal === 'whatsapp' || conv.canal === 'messenger' || conv.canal === 'instagram') && tipo !== 'nota_interna') {
    // Límite diario: solo WhatsApp plantillas
    if (conv.canal === 'whatsapp') {
      const efectiveLimite = cfg?.negocio_verificado ? (cfg?.limite_diario_wa ?? 1000) : 250
      const hoyUTC = new Date(); hoyUTC.setUTCHours(0, 0, 0, 0)
      const { count: plantillasHoy } = await admin
        .from('mensajes')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', perfil.tenant_id)
        .eq('tipo', 'plantilla')
        .eq('direccion', 'saliente')
        .gte('created_at', hoyUTC.toISOString())
      if ((plantillasHoy ?? 0) >= efectiveLimite - 2) {
        return NextResponse.json({
          error: `Límite diario de WhatsApp alcanzado (${plantillasHoy}/${efectiveLimite} plantillas). No puedes enviar más plantillas hoy.`,
        }, { status: 429 })
      }
    }

    // Ventana de mensajería:
    //   WhatsApp  → 24 h (después requiere plantilla aprobada)
    //   Messenger → 24 h (HUMAN_AGENT para >24h requiere App Review)
    //   Instagram → 24 h (Advanced Access para >24h requiere App Review)
    if (conv.canal === 'whatsapp' && msDesdeUltimo >= 86_400_000) {
      return NextResponse.json({
        error: 'El contacto no ha escrito en las últimas 24 h. Debes enviar una plantilla aprobada por Meta.',
        code: 'VENTANA_CERRADA',
      }, { status: 403 })
    }
    if (conv.canal === 'messenger' && msDesdeUltimo >= 86_400_000) {
      return NextResponse.json({
        error: 'El contacto no ha escrito en las últimas 24 h. La ventana de Messenger está cerrada (se requiere App Review para responder después de 24h).',
        code: 'VENTANA_CERRADA',
      }, { status: 403 })
    }
    if (conv.canal === 'instagram' && msDesdeUltimo >= 86_400_000) {
      return NextResponse.json({
        error: 'El contacto no ha escrito en las últimas 24 h. La ventana de Instagram está cerrada (se requiere App Review para responder después de 24h).',
        code: 'VENTANA_CERRADA',
      }, { status: 403 })
    }
  }

  let metaMsgId: string | null = null
  let estadoEnvio = 'enviado'

  if (cfg && tipo !== 'nota_interna') {
    try {
      if (conv.canal === 'whatsapp' && cfg.wa_access_token_enc && cfg.wa_phone_number_id) {
        const token = await decryptToken(cfg.wa_access_token_enc)
        const r = await fetch(`https://graph.facebook.com/v19.0/${cfg.wa_phone_number_id}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: conv.canal_contact_id,
            type: 'text',
            text: { preview_url: false, body: contenido },
          }),
        })
        const result = await r.json()
        if (!r.ok) {
          const metaMsg = result?.error?.message ?? 'Error al enviar por WhatsApp'
          return NextResponse.json({ error: metaMsg, code: 'META_ERROR' }, { status: 422 })
        }
        metaMsgId = result.messages?.[0]?.id ?? null

      } else if (conv.canal === 'messenger' && cfg.messenger_access_token_enc) {
        const token = await decryptToken(cfg.messenger_access_token_enc)
        const r = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: conv.canal_contact_id },
            message: { text: contenido },
            messaging_type: 'RESPONSE',
          }),
        })
        const result = await r.json()
        console.log('[enviar:messenger]', r.status, JSON.stringify(result))
        if (!r.ok) {
          const metaMsg = result?.error?.message ?? 'Error al enviar por Messenger'
          return NextResponse.json({ error: metaMsg, code: 'META_ERROR' }, { status: 422 })
        }
        metaMsgId = result.message_id ?? null

      } else if (conv.canal === 'instagram' && cfg.instagram_access_token_enc) {
        const token = await decryptToken(cfg.instagram_access_token_enc)
        // Usar el IG Business Account ID explícitamente para Instagram DMs
        const igEndpoint = cfg.instagram_account_id
          ? `https://graph.facebook.com/v20.0/${cfg.instagram_account_id}/messages?access_token=${token}`
          : `https://graph.facebook.com/v20.0/me/messages?access_token=${token}`
        const r = await fetch(igEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: conv.canal_contact_id },
            message: { text: contenido },
          }),
        })
        const result = await r.json()
        console.log('[enviar:instagram]', r.status, JSON.stringify(result), 'endpoint=', igEndpoint.split('?')[0])
        if (!r.ok) {
          const metaMsg = result?.error?.message ?? 'Error al enviar por Instagram'
          return NextResponse.json({ error: metaMsg, code: 'META_ERROR' }, { status: 422 })
        }
        metaMsgId = result.message_id ?? null
      }
    } catch (e) {
      return NextResponse.json({ error: 'Error de red al contactar Meta', code: 'META_ERROR' }, { status: 502 })
    }
  }

  const now = new Date().toISOString()
  const { data: msg, error } = await admin.from('mensajes').insert({
    conversacion_id,
    tenant_id: perfil.tenant_id,
    direccion: 'saliente',
    tipo,
    contenido,
    enviado_por: perfil.id,
    meta_message_id: metaMsgId,
    estado_envio: tipo === 'nota_interna' ? 'enviado' : estadoEnvio,
    leido_por_asesor: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (tipo !== 'nota_interna') {
    await admin.from('conversaciones').update({
      ultimo_mensaje_at: now,
      ultimo_mensaje_texto: contenido.slice(0, 100),
      ultimo_mensaje_direccion: 'saliente',
      updated_at: now,
    }).eq('id', conversacion_id)
  }

  // Solo cuenta plantillas de WhatsApp enviadas fuera de la ventana de 24h
  if (conv.canal === 'whatsapp' && tipo === 'plantilla' && estadoEnvio !== 'fallido' && cfg) {
    const ahora = new Date()
    const mismodia = new Date(cfg.limite_reset_at ?? 0).toDateString() === ahora.toDateString()
    await admin.from('config_meta').update({
      mensajes_iniciados_hoy: mismodia ? (cfg.mensajes_iniciados_hoy ?? 0) + 1 : 1,
      ...(mismodia ? {} : { limite_reset_at: ahora.toISOString() }),
    }).eq('tenant_id', perfil.tenant_id)
  }

  return NextResponse.json({ ok: true, mensaje: msg })
}
