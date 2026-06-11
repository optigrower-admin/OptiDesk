import { createAdminClient } from '@/lib/supabase/admin'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

export async function procesarMensajeMeta(body: unknown, tenantId: string) {
  const supabase = createAdminClient()
  const payload = body as Record<string, unknown>

  if (!payload.entry) return

  const entries = payload.entry as Array<Record<string, unknown>>
  for (const entry of entries) {
    const changes = entry.changes as Array<Record<string, unknown>> | undefined
    if (!changes) continue

    for (const change of changes) {
      const value = change.value as Record<string, unknown>

      if (change.field === 'message_template_status_update') {
        await manejarStatusPlantilla(supabase, tenantId, value)
        continue
      }

      const messages = value.messages as Array<Record<string, unknown>> | undefined
      if (!messages?.length) continue

      for (const msg of messages) {
        await procesarMensajeIndividual(supabase, tenantId, msg, value, payload.object as string)
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

  if (objeto === 'whatsapp_business_account') {
    canal = 'whatsapp'
    canalContactId = String(msg.from ?? '')
    const text = msg.text as Record<string, string> | undefined
    contenido = text?.body ?? ''
    if (msg.image)    tipo = 'imagen'
    if (msg.document) tipo = 'documento'
    if (msg.audio)    tipo = 'audio'
    if (msg.video)    tipo = 'video'
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
    const message = msg.message as Record<string, unknown> | undefined
    contenido = String(message?.text ?? '')
    metaMessageId = String((message as Record<string, string> | undefined)?.mid ?? '')
  }

  if (!canalContactId) return

  if (metaMessageId) {
    const { data: dup } = await supabase
      .from('mensajes').select('id').eq('meta_message_id', metaMessageId).maybeSingle()
    if (dup) return
  }

  let { data: conv } = await supabase
    .from('conversaciones')
    .select('id,assigned_to,no_leidos_count,sin_respuesta_asesor_desde')
    .eq('tenant_id', tenantId)
    .eq('canal', canal)
    .eq('canal_contact_id', canalContactId)
    .in('estado', ['abierta', 'pendiente'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const esNueva = !conv

  if (!conv) {
    const assignedTo = await determinarAsignacion(supabase, tenantId, canal, canalContactId)

    let clienteId: string | null = null
    if (canal === 'whatsapp') {
      const { data: cliente } = await supabase
        .from('clientes').select('id').eq('tenant_id', tenantId).eq('whatsapp_number', canalContactId).maybeSingle()
      clienteId = cliente?.id ?? null
    }

    const { data: nuevaConv } = await supabase
      .from('conversaciones')
      .insert({
        tenant_id: tenantId, canal, canal_contact_id: canalContactId,
        assigned_to: assignedTo, cliente_id: clienteId, estado: 'abierta',
      })
      .select('id,assigned_to,no_leidos_count,sin_respuesta_asesor_desde')
      .single()
    conv = nuevaConv
  }

  if (!conv) return

  const now = new Date().toISOString()
  await supabase.from('mensajes').insert({
    conversacion_id: conv.id, tenant_id: tenantId,
    direccion: 'entrante', tipo,
    contenido: contenido.slice(0, 4000),
    meta_message_id: metaMessageId || null,
    leido_por_asesor: false,
  })

  await supabase.from('conversaciones').update({
    ultimo_mensaje_at: now,
    ultimo_mensaje_texto: contenido.slice(0, 100),
    ultimo_mensaje_direccion: 'entrante',
    no_leidos_count: (conv.no_leidos_count ?? 0) + 1,
    sin_respuesta_asesor_desde: esNueva ? now : conv.sin_respuesta_asesor_desde ?? now,
    updated_at: now,
  }).eq('id', conv.id)

  await verificarLimiteDiario(supabase, tenantId)
}

async function determinarAsignacion(
  supabase: SupabaseAdmin, tenantId: string, canal: string, contactId: string
): Promise<string | null> {
  const { data: clienteExistente } = await supabase
    .from('clientes').select('assigned_to').eq('tenant_id', tenantId)
    .or(`whatsapp_number.eq.${contactId},messenger_id.eq.${contactId},instagram_id.eq.${contactId}`)
    .maybeSingle()
  if (clienteExistente?.assigned_to) return clienteExistente.assigned_to

  const { data: regla } = await supabase
    .from('reglas_asignacion').select('tipo_asignacion, asignar_a')
    .eq('tenant_id', tenantId).eq('activa', true)
    .or(`condicion_tipo.eq.canal,condicion_tipo.eq.siempre`)
    .or(`condicion_valor.eq.${canal},condicion_tipo.eq.siempre`)
    .order('prioridad_regla', { ascending: true }).limit(1).maybeSingle()

  if (regla?.tipo_asignacion === 'usuario_fijo' && regla.asignar_a) return regla.asignar_a

  const { data: asesores } = await supabase
    .from('usuarios').select('id').eq('tenant_id', tenantId).in('rol', ['admin', 'gerencia'])

  if (!asesores?.length) return null

  let menorCarga = Infinity
  let seleccionado: string | null = null
  for (const asesor of asesores) {
    const { count } = await supabase
      .from('conversaciones').select('id', { count: 'exact', head: true })
      .eq('assigned_to', asesor.id).eq('estado', 'abierta')
    if ((count ?? 0) < menorCarga) { menorCarga = count ?? 0; seleccionado = asesor.id }
  }
  return seleccionado
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
