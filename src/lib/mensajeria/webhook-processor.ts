import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToTenant } from './push'
import { buscarOCrearCliente } from '@/lib/clientes/buscarOCrearCliente'
import type { TriggerTipo } from '@/types/flujos'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

export async function procesarMensajeMeta(body: unknown, tenantId: string) {
  const supabase = createAdminClient()
  const payload = body as Record<string, unknown>
  if (!payload.entry) return

  const entries = payload.entry as Array<Record<string, unknown>>
  const objeto  = String(payload.object ?? '')

  for (const entry of entries) {
    // ── Messenger e Instagram: estructura entry.messaging[] ──────────────
    if (objeto === 'page' || objeto === 'instagram') {
      // DMs
      const messaging = entry.messaging as Array<Record<string, unknown>> | undefined
      if (messaging?.length) {
        for (const event of messaging) {
          const msgInner = event.message as Record<string, unknown> | undefined
          if (!msgInner) continue
          if (msgInner.is_echo) continue
          await procesarMensajeIndividual(supabase, tenantId, event, {}, objeto)
        }
      }

      // Comentarios de publicaciones (feed de FB, comments de IG)
      const changes = entry.changes as Array<Record<string, unknown>> | undefined
      if (changes?.length) {
        for (const change of changes) {
          console.log(`[webhook] field=${change.field} item=${(change.value as Record<string,unknown>)?.item} verb=${(change.value as Record<string,unknown>)?.verb}`)
          if (objeto === 'page' && change.field === 'feed') {
            await procesarComentarioFacebook(supabase, tenantId, change.value as Record<string, unknown>)
          } else if (objeto === 'instagram' && change.field === 'comments') {
            await procesarComentarioInstagram(supabase, tenantId, change.value as Record<string, unknown>)
          }
        }
      }
      continue
    }

    // ── WhatsApp / Instagram: estructura entry.changes[].value ────────────
    const changes = entry.changes as Array<Record<string, unknown>> | undefined
    if (!changes) continue

    for (const change of changes) {
      const value = change.value as Record<string, unknown>

      if (change.field === 'message_template_status_update') {
        await manejarStatusPlantilla(supabase, tenantId, value)
        continue
      }

      const statuses = value.statuses as Array<Record<string, unknown>> | undefined
      if (statuses?.length) {
        for (const st of statuses) await actualizarEstadoMensaje(supabase, tenantId, st)
      }

      const messages = value.messages as Array<Record<string, unknown>> | undefined
      if (!messages?.length) continue

      for (const msg of messages) {
        await procesarMensajeIndividual(supabase, tenantId, msg, value, objeto)
      }
    }
  }
}

async function procesarMensajeIndividual(
  supabase: SupabaseAdmin,
  tenantId: string,
  msg: Record<string, unknown>,
  value: Record<string, unknown>,
  objeto: string
) {
  let canal: 'whatsapp' | 'messenger' | 'instagram' = 'whatsapp'
  let canalContactId = ''
  let metaMessageId = String(msg.id ?? '')
  let contenido = ''
  let tipo: 'texto' | 'imagen' | 'documento' | 'audio' | 'video' = 'texto'

  let mediaId: string | null = null

  if (objeto === 'whatsapp_business_account') {
    canal = 'whatsapp'
    canalContactId = String(msg.from ?? '')
    const text = msg.text as Record<string, string> | undefined
    contenido = text?.body ?? ''
    if (msg.image) {
      tipo = 'imagen'
      const img = msg.image as Record<string, unknown>
      mediaId = String(img.id ?? '') || null
      if (!contenido) contenido = String(img.caption ?? '')
    }
    if (msg.document) {
      tipo = 'documento'
      const doc = msg.document as Record<string, unknown>
      mediaId = String(doc.id ?? '') || null
      contenido = String(doc.filename ?? doc.caption ?? '') || contenido
    }
    if (msg.audio) {
      tipo = 'audio'
      const aud = msg.audio as Record<string, unknown>
      mediaId = String(aud.id ?? '') || null
    }
    if (msg.video) {
      tipo = 'video'
      const vid = msg.video as Record<string, unknown>
      mediaId = String(vid.id ?? '') || null
      if (!contenido) contenido = String(vid.caption ?? '')
    }
    if (msg.sticker) {
      tipo = 'imagen'
      const stk = msg.sticker as Record<string, unknown>
      mediaId = String(stk.id ?? '') || null
    }
  } else if (objeto === 'page') {
    canal = 'messenger'
    const sender = msg.sender as Record<string, string> | undefined
    canalContactId = sender?.id ?? ''
    const message = msg.message as Record<string, unknown> | undefined
    contenido = String(message?.text ?? '')
    metaMessageId = String((message as Record<string, string> | undefined)?.mid ?? '')
  } else if (objeto === 'instagram') {
    canal = 'instagram'
    const sender = msg.sender as Record<string, string> | undefined
    canalContactId = sender?.id ?? ''
    // Instagram DM usa entry.messaging[] igual que Messenger
    const message = msg.message as Record<string, unknown> | undefined
    contenido = String(message?.text ?? '')
    metaMessageId = String((message as Record<string, string> | undefined)?.mid ?? '')
  }

  if (!canalContactId) return
  if ((canal === 'messenger' || canal === 'instagram') && !contenido.trim() && !metaMessageId) return  // ignorar delivery/read/postback

  if (metaMessageId) {
    const { data: dup } = await supabase
      .from('mensajes').select('id').eq('meta_message_id', metaMessageId).maybeSingle()
    if (dup) return
  }

  // ── Bot interno de colaboradores (sólo WhatsApp) ─────────────────────────
  if (canal === 'whatsapp' && contenido) {
    try {
      const { detectarColaborador, procesarMensajeColaborador } = await import('./colaborador-bot')
      const colaborador = await detectarColaborador(supabase, tenantId, canalContactId)
      if (colaborador) {
        const { getCfgMeta } = await import('./enviar-wa-directo')
        const cfg = await getCfgMeta(supabase, tenantId)
        if (cfg) await procesarMensajeColaborador(supabase, tenantId, colaborador, contenido, cfg)
        return
      }
    } catch (e) {
      console.error('[webhook] error en bot colaborador:', e)
    }
  }

  let { data: conv } = await supabase
    .from('conversaciones')
    .select('id,assigned_to,no_leidos_count,sin_respuesta_asesor_desde,cliente_id')
    .eq('tenant_id', tenantId)
    .eq('canal', canal)
    .eq('canal_contact_id', canalContactId)
    .in('estado', ['abierta', 'pendiente'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const esNueva = !conv
  let clienteEsNuevoOReactivado = false
  let resolvedClienteId: string | null = null

  if (!conv) {
    const assignedTo = await determinarAsignacion(supabase, tenantId, canal, canalContactId)

    let clienteId: string | null = null
    if (canal === 'whatsapp') {
      const { data: cliente } = await supabase
        .from('clientes').select('id').eq('tenant_id', tenantId).eq('whatsapp_number', canalContactId).maybeSingle()
      clienteId = cliente?.id ?? null
    } else if (canal === 'messenger') {
      const { data: existente } = await supabase
        .from('clientes').select('id').eq('tenant_id', tenantId).eq('messenger_id', canalContactId).maybeSingle()
      clienteId = existente?.id ?? await crearClienteDesdeMessenger(supabase, tenantId, canalContactId)
    } else if (canal === 'instagram') {
      const { data: existente } = await supabase
        .from('clientes').select('id').eq('tenant_id', tenantId).eq('instagram_id', canalContactId).maybeSingle()
      clienteId = existente?.id ?? await crearClienteDesdeInstagram(supabase, tenantId, canalContactId)
    }

    const { data: nuevaConv } = await supabase
      .from('conversaciones')
      .insert({
        tenant_id: tenantId, canal, canal_contact_id: canalContactId,
        assigned_to: assignedTo, cliente_id: clienteId, estado: 'abierta',
      })
      .select('id,assigned_to,no_leidos_count,sin_respuesta_asesor_desde,cliente_id')
      .single()
    conv = nuevaConv
    clienteEsNuevoOReactivado = true
  }

  if (!conv) return

  resolvedClienteId = (conv as Record<string, unknown>).cliente_id as string | null

  // WhatsApp: si no hay cliente vinculado, crear uno nuevo en seguimiento con el nombre del perfil
  if (canal === 'whatsapp' && !resolvedClienteId) {
    const contacts = value.contacts as Array<{ profile?: { name?: string } }> | undefined
    const nombreWa = contacts?.[0]?.profile?.name ?? `+${canalContactId}`
    try {
      const { cliente: nuevoCliente } = await buscarOCrearCliente({
        tenantId, canal: 'whatsapp', contactId: canalContactId,
        celular: canalContactId, nombre: nombreWa,
        enSeguimientoVentas: true, etapaVenta: 'nuevo_mensaje', etapaVentaOrden: -1,
        supabaseClient: supabase,
      })
      if (nuevoCliente) {
        resolvedClienteId = nuevoCliente.id
        await supabase.from('conversaciones').update({ cliente_id: nuevoCliente.id }).eq('id', conv.id)
      }
    } catch (e) { console.error('[webhook] error creando cliente WhatsApp:', e) }
  }

  // Messenger/Instagram: vincular cliente si la conversación no tiene uno
  if ((canal === 'messenger' || canal === 'instagram') && !resolvedClienteId) {
    let clienteVinculadoId: string | null = null
    if (canal === 'messenger') {
      const { data: existente } = await supabase
        .from('clientes').select('id').eq('tenant_id', tenantId).eq('messenger_id', canalContactId).maybeSingle()
      clienteVinculadoId = existente?.id ?? await crearClienteDesdeMessenger(supabase, tenantId, canalContactId)
    } else {
      const { data: existente } = await supabase
        .from('clientes').select('id').eq('tenant_id', tenantId).eq('instagram_id', canalContactId).maybeSingle()
      clienteVinculadoId = existente?.id ?? await crearClienteDesdeInstagram(supabase, tenantId, canalContactId)
    }
    if (clienteVinculadoId) {
      resolvedClienteId = clienteVinculadoId
      await supabase.from('conversaciones').update({ cliente_id: clienteVinculadoId }).eq('id', conv.id)
    }
  }

  const now = new Date().toISOString()
  await supabase.from('mensajes').insert({
    conversacion_id: conv.id, tenant_id: tenantId,
    direccion: 'entrante', tipo,
    contenido: contenido.slice(0, 4000),
    meta_message_id: metaMessageId || null,
    media_url: mediaId ? `meta-media://${mediaId}` : null,
    leido_por_asesor: false,
  })

  // Push notification cuando Chrome está cerrado o en background
  if (contenido) {
    const remitente = canalContactId
    sendPushToTenant(tenantId, `📱 ${remitente}`, contenido.slice(0, 100)).catch(() => {})
  }

  await supabase.from('conversaciones').update({
    ultimo_mensaje_at: now,
    ultimo_mensaje_texto: contenido.slice(0, 100),
    ultimo_mensaje_direccion: 'entrante',
    no_leidos_count: (conv.no_leidos_count ?? 0) + 1,
    sin_respuesta_asesor_desde: esNueva ? now : conv.sin_respuesta_asesor_desde ?? now,
    updated_at: now,
  }).eq('id', conv.id)

  await verificarLimiteDiario(supabase, tenantId)

  // Iniciar/continuar flujo de automatización
  // await garantiza que Vercel no termine la función serverless antes de que se ejecute
  const triggerTipos: TriggerTipo | TriggerTipo[] = clienteEsNuevoOReactivado
    ? ['mensaje_nuevo', 'nuevo_cliente']
    : 'mensaje_nuevo'
  try {
    const { iniciarFlujoParaConversacion } = await import('./flow-executor')
    await iniciarFlujoParaConversacion(tenantId, conv.id, resolvedClienteId, triggerTipos)
  } catch (e) {
    console.error('[flujo] error iniciando flujo:', e)
  }
}

async function determinarAsignacion(
  supabase: SupabaseAdmin, tenantId: string, canal: string, contactId: string
): Promise<string | null> {
  // Si el cliente ya tenía asesor asignado, mantenerlo
  const { data: clienteExistente } = await supabase
    .from('clientes').select('assigned_to').eq('tenant_id', tenantId)
    .or(`whatsapp_number.eq.${contactId},messenger_id.eq.${contactId},instagram_id.eq.${contactId}`)
    .maybeSingle()
  if (clienteExistente?.assigned_to) return clienteExistente.assigned_to

  // Solo aplicar reglas explícitas de asignación configuradas por el tenant
  const { data: regla } = await supabase
    .from('reglas_asignacion').select('tipo_asignacion, asignar_a')
    .eq('tenant_id', tenantId).eq('activa', true)
    .or(`condicion_tipo.eq.canal,condicion_tipo.eq.siempre`)
    .or(`condicion_valor.eq.${canal},condicion_tipo.eq.siempre`)
    .order('prioridad_regla', { ascending: true }).limit(1).maybeSingle()

  if (regla?.tipo_asignacion === 'usuario_fijo' && regla.asignar_a) return regla.asignar_a

  // Sin regla activa: llega sin asignar para que el equipo lo tome manualmente
  return null
}

async function verificarLimiteDiario(supabase: SupabaseAdmin, tenantId: string) {
  const { data: cfg } = await supabase
    .from('config_meta').select('mensajes_iniciados_hoy,limite_diario_wa,limite_reset_at')
    .eq('tenant_id', tenantId).maybeSingle()
  if (!cfg) return

  const ahora = new Date()
  const resetAt = new Date(cfg.limite_reset_at)
  if (resetAt.toDateString() !== ahora.toDateString()) {
    await supabase.from('config_meta')
      .update({ mensajes_iniciados_hoy: 0, limite_reset_at: ahora.toISOString() })
      .eq('tenant_id', tenantId)
  }
}

async function actualizarEstadoMensaje(
  supabase: SupabaseAdmin,
  tenantId: string,
  status: Record<string, unknown>
) {
  const metaMsgId = String(status.id ?? '')
  const statusMeta = String(status.status ?? '')
  if (!metaMsgId || !statusMeta) return

  const map: Record<string, string> = {
    sent:      'enviado',
    delivered: 'entregado',
    read:      'leido',
    failed:    'fallido',
  }
  const estadoEnvio = map[statusMeta]
  if (!estadoEnvio) return

  await supabase.from('mensajes')
    .update({ estado_envio: estadoEnvio })
    .eq('meta_message_id', metaMsgId)
    .eq('tenant_id', tenantId)
}

async function crearClienteDesdeMessenger(
  supabase: SupabaseAdmin,
  tenantId: string,
  psid: string
): Promise<string | null> {
  try {
    const { data: cfg } = await supabase
      .from('config_meta').select('messenger_access_token_enc, messenger_page_id')
      .eq('tenant_id', tenantId).maybeSingle()
    if (!cfg?.messenger_access_token_enc) return null

    let token = cfg.messenger_access_token_enc
    try { const { decrypt } = await import('@/lib/crypto'); token = decrypt(cfg.messenger_access_token_enc) } catch { /* dev */ }

    // Intentar PSID endpoint primero
    let nombre: string | null = null
    const r = await fetch(`https://graph.facebook.com/v20.0/${psid}?fields=name&access_token=${token}`)
    if (r.ok) {
      const profile = await r.json() as { name?: string }
      nombre = profile.name ?? null
    }

    // Fallback: buscar nombre en el listado de conversaciones de la página
    if (!nombre) {
      const pageId = cfg.messenger_page_id ?? ''
      const rc = await fetch(`https://graph.facebook.com/v20.0/me/conversations?fields=participants%7Bid%2Cname%7D&limit=200&access_token=${token}`)
      if (rc.ok) {
        const dc = await rc.json() as { data?: Array<{ participants?: { data?: Array<{ id: string; name: string }> } }> }
        for (const fbConv of dc.data ?? []) {
          const p = fbConv.participants?.data?.find(p => p.id === psid && p.id !== pageId)
          if (p?.name) { nombre = p.name; break }
        }
      }
    }

    const { data: nuevo } = await supabase
      .from('clientes')
      .insert({ tenant_id: tenantId, nombre, messenger_id: psid })
      .select('id').single()
    return nuevo?.id ?? null
  } catch {
    return null
  }
}

async function crearClienteDesdeInstagram(
  supabase: SupabaseAdmin,
  tenantId: string,
  igsid: string
): Promise<string | null> {
  try {
    const { data: cfg } = await supabase
      .from('config_meta').select('instagram_access_token_enc, instagram_account_id')
      .eq('tenant_id', tenantId).maybeSingle()
    if (!cfg?.instagram_access_token_enc) return null

    let token = cfg.instagram_access_token_enc
    try { const { decrypt } = await import('@/lib/crypto'); token = decrypt(cfg.instagram_access_token_enc) } catch { /* dev */ }

    let nombre: string | null = null
    let username: string | null = null

    // 1. Endpoint directo por IGSID
    const r = await fetch(`https://graph.facebook.com/v20.0/${igsid}?fields=name,username&access_token=${token}`)
    if (r.ok) {
      const profile = await r.json() as { name?: string; username?: string; error?: unknown }
      if (!profile.error) { nombre = profile.name ?? null; username = profile.username ?? null }
    }

    // 2. Fallback: /me/conversations?platform=instagram — igual que Messenger
    if (!nombre && !username) {
      const rc = await fetch(
        `https://graph.facebook.com/v20.0/me/conversations?platform=instagram&fields=participants%7Bid%2Cname%2Cusername%7D&limit=200&access_token=${token}`
      )
      if (rc.ok) {
        const dc = await rc.json() as { data?: Array<{ participants?: { data?: Array<{ id: string; name?: string; username?: string }> } }> }
        for (const conv of dc.data ?? []) {
          const p = conv.participants?.data?.find(p => p.id === igsid)
          if (p) { nombre = p.name ?? null; username = p.username ?? null; break }
        }
      }
    }

    const displayNombre = nombre ?? (username ? `@${username}` : null)
    const { data: nuevo } = await supabase
      .from('clientes')
      .insert({ tenant_id: tenantId, nombre: displayNombre, instagram_id: igsid })
      .select('id').single()
    return nuevo?.id ?? null
  } catch {
    return null
  }
}

async function procesarComentarioFacebook(
  supabase: SupabaseAdmin,
  tenantId: string,
  value: Record<string, unknown>
) {
  // Solo comentarios nuevos, no likes/reactions/edits/removes
  if (value.item !== 'comment' || value.verb === 'remove') {
    console.log('[webhook:fb-feed] ignorando item/verb:', value.item, value.verb)
    return
  }

  const commentId   = String(value.comment_id ?? '')
  const postId      = String(value.post_id ?? '')
  console.log(`[webhook:fb-comment] commentId=${commentId} postId=${postId}`)
  const parentId    = String(value.parent_id ?? '')
  const texto       = String(value.message ?? '')
  const from        = value.from as Record<string, string> | undefined
  const ts          = Number(value.created_time ?? 0)

  if (!commentId || !postId) return

  const { data: pub } = await supabase
    .from('publicaciones')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('publicacion_id', postId)
    .maybeSingle()

  if (!pub) {
    console.log(`[webhook:fb-comment] publicación NO encontrada en DB para postId=${postId}`)
    return
  }
  console.log(`[webhook:fb-comment] publicación encontrada id=${pub.id}, insertando comentario`)

  const esRespuesta = Boolean(parentId && parentId !== postId)

  await supabase.from('comentarios').upsert({
    tenant_id:           tenantId,
    publicacion_id:      pub.id,
    canal:               'facebook',
    comentario_id:       commentId,
    texto:               texto || null,
    autor_id:            from?.id ?? null,
    autor_nombre:        from?.name ?? null,
    estado:              'nuevo',
    es_respuesta:        esRespuesta,
    parent_comentario_id: parentId || null,
    created_at:          ts ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
  }, { onConflict: 'tenant_id,comentario_id', ignoreDuplicates: true })

  // Actualizar contador de la publicación
  if (!esRespuesta) {
    const { count } = await supabase
      .from('comentarios')
      .select('*', { count: 'exact', head: true })
      .eq('publicacion_id', pub.id)
      .neq('es_respuesta', true)
    await supabase.from('publicaciones')
      .update({ comentarios_count: count ?? 0 })
      .eq('id', pub.id)
  }
}

async function procesarComentarioInstagram(
  supabase: SupabaseAdmin,
  tenantId: string,
  value: Record<string, unknown>
) {
  const commentId     = String(value.id ?? '')
  const texto         = String(value.text ?? '')
  const media         = value.media as Record<string, string> | undefined
  const mediaId       = String(media?.id ?? '')
  const from          = value.from as Record<string, string> | undefined

  if (!commentId || !mediaId) return

  const { data: pub } = await supabase
    .from('publicaciones')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('publicacion_id', mediaId)
    .maybeSingle()

  if (!pub) return

  await supabase.from('comentarios').upsert({
    tenant_id:      tenantId,
    publicacion_id: pub.id,
    canal:          'instagram',
    comentario_id:  commentId,
    texto:          texto || null,
    autor_id:       from?.id ?? null,
    autor_username: from?.username ?? null,
    autor_nombre:   from?.username ? `@${from.username}` : null,
    estado:         'nuevo',
    created_at:     new Date().toISOString(),
  }, { onConflict: 'tenant_id,comentario_id', ignoreDuplicates: true })
}

async function manejarStatusPlantilla(
  supabase: SupabaseAdmin, tenantId: string, value: Record<string, unknown>
) {
  const templateName = String(value.message_template_name ?? '')
  const newStatus    = String(value.event ?? '').toLowerCase()
  const motivo       = String(value.reason ?? '') || null
  if (!templateName) return

  const metaStatus = newStatus === 'approved' ? 'aprobada'
    : newStatus === 'rejected' ? 'rechazada' : 'enviada_a_meta'

  await supabase.from('plantillas_mensajes').update({
    meta_status: metaStatus,
    meta_rechazo_motivo: metaStatus === 'rechazada' ? motivo : null,
    updated_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).eq('meta_template_name', templateName)
}
