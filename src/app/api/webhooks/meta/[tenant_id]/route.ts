import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { decrypt } from '@/lib/crypto'
import { buscarOCrearCliente } from '@/lib/clientes/buscarOCrearCliente'
import { iniciarFlujoParaConversacion } from '@/lib/mensajeria/flow-executor'
import type { TriggerTipo } from '@/types/flujos'

export const dynamic = 'force-dynamic'

// GET — verificación del webhook por Meta
export async function GET(
  request: NextRequest,
  { params }: { params: { tenant_id: string } }
) {
  const sp        = request.nextUrl.searchParams
  const mode      = sp.get('hub.mode')
  const token     = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')

  if (mode !== 'subscribe') return new NextResponse('Forbidden', { status: 403 })

  // Intentar con admin client, si falla (error o null) usar anon como fallback
  let verifyToken: string | null = null

  const admin = createAdminClient()
  const { data: adminData } = await admin
    .from('config_meta')
    .select('meta_webhook_verify_token')
    .eq('tenant_id', params.tenant_id)
    .single()

  verifyToken = adminData?.meta_webhook_verify_token ?? null

  if (!verifyToken) {
    // Fallback: anon client con política pública (webhook_verify_public_read)
    const anon = createAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: anonData } = await anon
      .from('config_meta')
      .select('meta_webhook_verify_token')
      .eq('tenant_id', params.tenant_id)
      .single()
    verifyToken = anonData?.meta_webhook_verify_token ?? null
  }

  if (!verifyToken || verifyToken !== token) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  })
}

// Dar hasta 60 s al procesamiento (Vercel Pro) — en Hobby se recorta a 10 s
export const maxDuration = 60

// POST — mensajes entrantes de Meta
export async function POST(
  request: NextRequest,
  { params }: { params: { tenant_id: string } }
) {
  let body: unknown
  try { body = await request.json() } catch { return new NextResponse('EVENT_RECEIVED', { status: 200 }) }

  // Await garantiza que Vercel no mate el serverless antes de que se guarde el cliente
  await procesarMensajeMeta(body, params.tenant_id).catch(e => console.error('[webhook] error:', e))
  return new NextResponse('EVENT_RECEIVED', { status: 200 })
}

// ─── Motor de procesamiento (async, no bloquea la respuesta) ─────────────────

async function procesarMensajeMeta(body: unknown, tenantId: string) {
  const supabase = createAdminClient()
  const payload = body as Record<string, unknown>

  // Manejar actualizaciones de estado de plantillas
  if (payload.entry) {
    const entries = payload.entry as Array<Record<string, unknown>>
    for (const entry of entries) {
      const changes = entry.changes as Array<Record<string, unknown>> | undefined
      if (!changes) continue

      for (const change of changes) {
        const value = change.value as Record<string, unknown>

        // Actualización de estado de plantilla
        if (change.field === 'message_template_status_update') {
          await manejarStatusPlantilla(supabase, tenantId, value)
          continue
        }

        // Comentarios de Facebook (feed webhook)
        if (change.field === 'feed') {
          await procesarComentarioFacebook(supabase, tenantId, value)
          continue
        }

        // Mensajes entrantes
        const messages = value.messages as Array<Record<string, unknown>> | undefined
        if (!messages?.length) continue

        for (const msg of messages) {
          await procesarMensajeIndividual(supabase, tenantId, msg, value, payload.object as string)
        }
      }
    }
  }
}

// ─── Obtiene el nombre del contacto desde el webhook o la Graph API ─────────

async function obtenerNombreContacto(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  canal: 'whatsapp' | 'messenger' | 'instagram',
  canalContactId: string,
  value: Record<string, unknown>,
): Promise<string> {
  // WhatsApp: el nombre del perfil viene en el payload
  if (canal === 'whatsapp') {
    const contacts = value.contacts as Array<{ profile?: { name?: string } }> | undefined
    const nombre = contacts?.[0]?.profile?.name
    if (nombre) return nombre
    // Fallback: formatear el número como +XX XXX XXX XXXX
    return `+${canalContactId}`
  }

  // Messenger / Instagram: llamar Graph API con el token del tenant
  try {
    const { data: cfg } = await supabase
      .from('config_meta')
      .select('messenger_access_token_enc, instagram_access_token_enc')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    const tokenEnc = canal === 'messenger'
      ? cfg?.messenger_access_token_enc
      : cfg?.instagram_access_token_enc

    if (!tokenEnc) throw new Error('Sin token')

    const token    = decrypt(tokenEnc)
    const fields   = canal === 'instagram' ? 'name,username' : 'name'
    const url      = `https://graph.facebook.com/v19.0/${canalContactId}?fields=${fields}&access_token=${token}`
    const resp     = await fetch(url)

    if (resp.ok) {
      const data = await resp.json() as { name?: string; username?: string }
      return data.name ?? data.username ?? canalContactId
    }
  } catch {
    // Graph API falló — usar placeholder
  }

  const label = canal === 'messenger' ? 'Messenger' : 'Instagram'
  return `${label} - ${canalContactId.slice(-6)}`
}

// ─── Crea o vincula el cliente a la conversación y lo pone en seguimiento ───

async function asegurarClienteEnSeguimiento(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  canal: 'whatsapp' | 'messenger' | 'instagram',
  canalContactId: string,
  nombreSugerido: string,
  convId: string,
  assignedTo: string | null,
): Promise<string | null> {
  try {
    const { cliente, creado } = await buscarOCrearCliente({
      tenantId,
      canal,
      contactId:                   canalContactId,
      celular:                     canal === 'whatsapp' ? canalContactId : undefined,
      nombre:                      nombreSugerido,
      assignedTo:                  assignedTo ?? undefined,
      enSeguimientoVentas:         true,
      etapaVenta:                  'nuevo_mensaje',
      etapaVentaOrden:             -1,
      nombrePendienteAprobacion:   true,
      supabaseClient:              supabase,
    })

    if (!cliente) {
      console.error('[webhook] buscarOCrearCliente retornó null')
      return null
    }

    const clienteId: string = cliente.id

    if (!creado) {
      // Cliente encontrado: actualizar seguimiento usando 2 UPDATEs separados.
      // Esto evita que una columna faltante (nombre_pendiente_aprobacion) o un
      // CHECK constraint antiguo bloqueen el campo crítico en_seguimiento_ventas.

      // UPDATE 1: campos críticos (garantizar seguimiento)
      const coreFields: Record<string, unknown> = {
        en_seguimiento_ventas: true,
        etapa_venta_orden:     -1,
      }
      if (!cliente.assigned_to && assignedTo) coreFields.assigned_to = assignedTo

      let { error: errCore } = await supabase.from('clientes')
        .update({ ...coreFields, etapa_venta: 'nuevo_mensaje' })
        .eq('id', clienteId)

      if (errCore) {
        console.error('[webhook] error core con nuevo_mensaje:', errCore.message, '|', errCore.code)
        // Fallback: CHECK constraint no incluye 'nuevo_mensaje' (migration_v81 pendiente)
        if (errCore.code === '23514') {
          ;({ error: errCore } = await supabase.from('clientes')
            .update({ ...coreFields, etapa_venta: 'nuevo' })
            .eq('id', clienteId))
          if (errCore) console.error('[webhook] error fallback etapa=nuevo:', errCore.message)
          else console.log('[webhook] ⚠ usé etapa=nuevo; ejecuta migration_v81 en Supabase')
        }
      }

      // UPDATE 2: campos opcionales (no críticos; ignorar si la columna no existe)
      const optFields: Record<string, unknown> = { nombre_pendiente_aprobacion: true }
      // Si el perfil de WhatsApp trae un nombre válido, actualizarlo para mostrar quién volvió a escribir
      const esNombreReal = nombreSugerido && !nombreSugerido.startsWith('+') && !nombreSugerido.startsWith('Contacto') && !nombreSugerido.startsWith('Messenger') && !nombreSugerido.startsWith('Instagram')
      if (esNombreReal) optFields.nombre = nombreSugerido
      const { error: errOpt } = await supabase.from('clientes').update(optFields).eq('id', clienteId)
      if (errOpt && errOpt.code !== '42703') console.error('[webhook] error opt update:', errOpt.message)
    }

    const { error: errConv } = await supabase.from('conversaciones').update({ cliente_id: clienteId }).eq('id', convId)
    if (errConv) console.error('[webhook] error vinculando conversación:', errConv.message)

    return clienteId
  } catch (e) {
    console.error('[webhook] error en asegurarClienteEnSeguimiento:', e)
    return null
  }
}

// ─── Procesamiento de cada mensaje individual ────────────────────────────────

async function procesarMensajeIndividual(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  msg: Record<string, unknown>,
  value: Record<string, unknown>,
  objeto: string
) {
  // Determinar canal y datos del contacto
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
    if (msg.image)     tipo = 'imagen'
    if (msg.document)  tipo = 'documento'
    if (msg.audio)     tipo = 'audio'
    if (msg.video)     tipo = 'video'
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

  console.log(`[webhook] ► msg de ${canalContactId} | tenant=${tenantId} | msgId=${metaMessageId}`)

  // Idempotencia: no duplicar si ya procesamos este mensaje
  if (metaMessageId) {
    const { data: dup } = await supabase
      .from('mensajes')
      .select('id')
      .eq('meta_message_id', metaMessageId)
      .maybeSingle()
    if (dup) {
      console.log(`[webhook] ✓ duplicado ignorado msgId=${metaMessageId}`)
      return
    }
  }

  // Buscar conversación activa (incluir cliente_id para saber si ya está vinculado)
  let { data: conv } = await supabase
    .from('conversaciones')
    .select('id,assigned_to,no_leidos_count,cliente_id,sin_respuesta_asesor_desde')
    .eq('tenant_id', tenantId)
    .eq('canal', canal)
    .eq('canal_contact_id', canalContactId)
    .in('estado', ['abierta', 'pendiente'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const esNueva = !conv
  console.log(`[webhook] conv=${conv?.id ?? 'NUEVA'} esNueva=${esNueva}`)

  if (!conv) {
    const assignedTo = await determinarAsignacion(supabase, tenantId, canal, canalContactId)

    // Para WhatsApp buscar cliente existente por número antes de crear la conversación
    let clienteId: string | null = null
    if (canal === 'whatsapp') {
      const { data: cliente } = await supabase
        .from('clientes')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('whatsapp_number', canalContactId)
        .maybeSingle()
      clienteId = cliente?.id ?? null
      console.log(`[webhook] cliente por whatsapp_number=${canalContactId}: ${clienteId ?? 'no encontrado'}`)
    }

    const { data: nuevaConv, error: errConv } = await supabase
      .from('conversaciones')
      .insert({
        tenant_id:        tenantId,
        canal,
        canal_contact_id: canalContactId,
        assigned_to:      assignedTo,
        cliente_id:       clienteId,
        estado:           'abierta',
      })
      .select('id,assigned_to,no_leidos_count,cliente_id,sin_respuesta_asesor_desde')
      .single()
    if (errConv) console.error('[webhook] error creando conversación:', errConv.message)
    conv = nuevaConv
  }

  if (!conv) {
    console.error('[webhook] ✗ no se pudo obtener conversación — abortando')
    return
  }

  // ── Garantizar que el cliente existe y está en Seguimiento Ventas ──
  const clienteIdActual = (conv as Record<string, unknown>).cliente_id as string | null
  const assignedToActual = (conv as Record<string, unknown>).assigned_to as string | null
  let resolvedClienteId: string | null = clienteIdActual
  // Rastrea si el cliente es nuevo o fue reactivado — activa trigger 'nuevo_cliente' como fallback
  let clienteEsNuevoOReactivado = false

  console.log(`[webhook] clienteIdActual=${clienteIdActual ?? 'null'} convId=${conv.id}`)

  if (!clienteIdActual) {
    // Sin cliente vinculado → crear/buscar con buscarOCrearCliente
    const nombreSugerido = await obtenerNombreContacto(supabase, tenantId, canal, canalContactId, value)
    console.log(`[webhook] asegurarClienteEnSeguimiento para "${nombreSugerido}"`)
    resolvedClienteId = await asegurarClienteEnSeguimiento(
      supabase, tenantId, canal, canalContactId,
      nombreSugerido, conv.id, assignedToActual,
    )
    clienteEsNuevoOReactivado = true
    console.log(`[webhook] resolvedClienteId después de asegurar: ${resolvedClienteId ?? 'null'}`)
  } else {
    // Verificar que el cliente aún existe (pudo haber sido eliminado)
    const { data: clienteVivo } = await supabase
      .from('clientes')
      .select('id, en_seguimiento_ventas, etapa_venta')
      .eq('id', clienteIdActual)
      .maybeSingle()

    console.log(`[webhook] clienteVivo id=${clienteVivo?.id ?? 'no existe'} en_seg=${clienteVivo?.en_seguimiento_ventas} etapa=${clienteVivo?.etapa_venta}`)

    if (!clienteVivo) {
      // Cliente fue eliminado → limpiar referencia y crear uno nuevo
      await supabase.from('conversaciones').update({ cliente_id: null }).eq('id', conv.id)
      const nombreSugerido = await obtenerNombreContacto(supabase, tenantId, canal, canalContactId, value)
      resolvedClienteId = await asegurarClienteEnSeguimiento(
        supabase, tenantId, canal, canalContactId,
        nombreSugerido, conv.id, assignedToActual,
      )
      clienteEsNuevoOReactivado = true
      console.log(`[webhook] cliente recreado: ${resolvedClienteId ?? 'null'}`)
    } else if (!clienteVivo.en_seguimiento_ventas) {
      // Cliente existe pero no está en seguimiento → reactivar en columna Nuevo Contacto - Mensaje
      console.log(`[webhook] reactivando cliente ${clienteIdActual} en seguimiento`)
      clienteEsNuevoOReactivado = true

      // UPDATE 1: campos críticos con fallback de etapa
      let { error: errCore } = await supabase.from('clientes').update({
        en_seguimiento_ventas: true,
        etapa_venta:           'nuevo_mensaje',
        etapa_venta_orden:     -1,
      }).eq('id', clienteIdActual)

      if (errCore) {
        console.error('[webhook] ✗ error reactivando con nuevo_mensaje:', errCore.message, '|', errCore.code)
        if (errCore.code === '23514') {
          // CHECK constraint antiguo: fallback a 'nuevo'
          ;({ error: errCore } = await supabase.from('clientes').update({
            en_seguimiento_ventas: true,
            etapa_venta:           'nuevo',
            etapa_venta_orden:     0,
          }).eq('id', clienteIdActual))
          if (errCore) console.error('[webhook] ✗ error fallback etapa=nuevo:', errCore.message)
          else console.log(`[webhook] ⚠ usé etapa=nuevo; ejecuta migration_v81 en Supabase`)
        }
      } else {
        console.log(`[webhook] ✓ cliente ${clienteIdActual} reactivado en nuevo_mensaje`)
      }

      // UPDATE 2: campos opcionales (no bloquean el flujo si fallan)
      await supabase.from('clientes').update({ nombre_pendiente_aprobacion: true })
        .eq('id', clienteIdActual)
        .then(({ error }) => {
          if (error && error.code !== '42703') console.error('[webhook] error nombre_pendiente:', error.message)
        })
    } else {
      console.log(`[webhook] cliente ya en seguimiento etapa=${clienteVivo.etapa_venta}`)
    }
  }

  // Guardar el mensaje
  const now = new Date().toISOString()
  await supabase.from('mensajes').insert({
    conversacion_id:  conv.id,
    tenant_id:        tenantId,
    direccion:        'entrante',
    tipo,
    contenido:        contenido.slice(0, 4000),
    meta_message_id:  metaMessageId || null,
    leido_por_asesor: false,
  })

  // Actualizar conversación
  const sinRespDesde = (conv as Record<string, unknown>).sin_respuesta_asesor_desde as string | null
  await supabase.from('conversaciones').update({
    ultimo_mensaje_at:          now,
    ultimo_mensaje_texto:       contenido.slice(0, 100),
    ultimo_mensaje_direccion:   'entrante',
    no_leidos_count:            ((conv as Record<string, unknown>).no_leidos_count as number ?? 0) + 1,
    sin_respuesta_asesor_desde: esNueva ? now : sinRespDesde ?? now,
    updated_at:                 now,
  }).eq('id', conv.id)

  await verificarLimiteDiario(supabase, tenantId)

  // ── Activar flujo de automatización para este mensaje ──
  // Si hay ejecución activa en pausa (nodo esperar), la continúa.
  // Si no hay ninguna, busca un flujo activo por trigger_tipo y lo inicia.
  // Para clientes nuevos o reactivados también prueba 'nuevo_cliente' como fallback,
  // por si el usuario configuró el flujo con ese trigger en lugar de 'mensaje_nuevo'.
  const triggerTipos: TriggerTipo | TriggerTipo[] = clienteEsNuevoOReactivado
    ? ['mensaje_nuevo', 'nuevo_cliente']
    : 'mensaje_nuevo'
  console.log(`[webhook] iniciando flujo para conv=${conv.id} cliente=${resolvedClienteId ?? 'null'} trigger=${JSON.stringify(triggerTipos)}`)
  try {
    await iniciarFlujoParaConversacion(tenantId, conv.id, resolvedClienteId, triggerTipos)
    console.log(`[webhook] ✓ flujo iniciado/continuado`)
  } catch (e) {
    console.error('[webhook] ✗ error iniciando flujo:', e)
  }
  console.log(`[webhook] ◄ procesamiento completo para ${canalContactId}`)
}

async function determinarAsignacion(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  canal: string,
  contactId: string
): Promise<string | null> {
  // 1. ¿El cliente existe y tiene asesor asignado?
  const { data: clienteExistente } = await supabase
    .from('clientes')
    .select('assigned_to')
    .eq('tenant_id', tenantId)
    .or(`whatsapp_number.eq.${contactId},messenger_id.eq.${contactId},instagram_id.eq.${contactId}`)
    .maybeSingle()
  if (clienteExistente?.assigned_to) return clienteExistente.assigned_to

  // 2. ¿Hay regla para este canal?
  const { data: regla } = await supabase
    .from('reglas_asignacion')
    .select('tipo_asignacion, asignar_a')
    .eq('tenant_id', tenantId)
    .eq('activa', true)
    .or(`condicion_tipo.eq.canal,condicion_tipo.eq.siempre`)
    .or(`condicion_valor.eq.${canal},condicion_tipo.eq.siempre`)
    .order('prioridad_regla', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (regla?.tipo_asignacion === 'usuario_fijo' && regla.asignar_a) return regla.asignar_a

  // 3. Round-robin: asesor con menos conversaciones abiertas
  const { data: asesores } = await supabase
    .from('usuarios')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('rol', ['admin', 'gerencia'])

  if (!asesores?.length) return null

  let menorCarga = Infinity
  let seleccionado: string | null = null

  for (const asesor of asesores) {
    const { count } = await supabase
      .from('conversaciones')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', asesor.id)
      .eq('estado', 'abierta')

    if ((count ?? 0) < menorCarga) {
      menorCarga = count ?? 0
      seleccionado = asesor.id
    }
  }

  return seleccionado
}

async function verificarLimiteDiario(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string
) {
  const { data: cfg } = await supabase
    .from('config_meta')
    .select('mensajes_iniciados_hoy, limite_diario_wa, limite_reset_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!cfg) return

  const ahora = new Date()
  const resetAt = new Date(cfg.limite_reset_at)
  const mismodia = resetAt.toDateString() === ahora.toDateString()

  if (!mismodia) {
    await supabase
      .from('config_meta')
      .update({ mensajes_iniciados_hoy: 0, limite_reset_at: ahora.toISOString() })
      .eq('tenant_id', tenantId)
  }
}

async function procesarComentarioFacebook(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  value: Record<string, unknown>
) {
  // Solo procesar comentarios nuevos, no ediciones ni borrados
  if (value.item !== 'comment' || value.verb !== 'add') return

  const postId      = String(value.post_id ?? '')
  const commentId   = String(value.comment_id ?? '')
  const message     = String(value.message ?? '')
  const senderId    = String(value.sender_id ?? '')
  const senderName  = String(value.sender_name ?? '')
  const parentId    = value.parent_id ? String(value.parent_id) : null
  const createdTime = value.created_time
    ? new Date(Number(value.created_time) * 1000).toISOString()
    : new Date().toISOString()

  if (!postId || !commentId) return

  // Buscar la publicación en DB (debe estar sincronizada previamente)
  const { data: pub } = await supabase
    .from('publicaciones')
    .select('id, comentarios_count')
    .eq('tenant_id', tenantId)
    .eq('publicacion_id', postId)
    .maybeSingle()

  if (!pub) return // Post no sincronizado aún

  // Si parent_id existe y es distinto del post_id, es una respuesta a otro comentario
  const esRespuesta = parentId !== null && parentId !== postId

  await supabase.from('comentarios').upsert({
    tenant_id:      tenantId,
    publicacion_id: pub.id,
    canal:          'facebook',
    comentario_id:  commentId,
    texto:          message || null,
    autor_id:       senderId || null,
    autor_nombre:   senderName || null,
    estado:         'nuevo',
    es_respuesta:   esRespuesta,
    created_at:     createdTime,
  }, { onConflict: 'tenant_id,comentario_id', ignoreDuplicates: true })

  // Actualizar contador con conteo real desde DB
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

async function manejarStatusPlantilla(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  value: Record<string, unknown>
) {
  const templateName = String(value.message_template_name ?? '')
  const newStatus    = String(value.event ?? '').toLowerCase()
  const motivo       = String(value.reason ?? '') || null

  if (!templateName) return

  const metaStatus = newStatus === 'approved' ? 'aprobada'
    : newStatus === 'rejected' ? 'rechazada'
    : 'enviada_a_meta'

  await supabase
    .from('plantillas_mensajes')
    .update({
      meta_status:         metaStatus,
      meta_rechazo_motivo: metaStatus === 'rechazada' ? motivo : null,
      updated_at:          new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('meta_template_name', templateName)
}
