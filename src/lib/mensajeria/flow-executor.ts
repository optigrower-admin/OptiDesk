// ══════════════════════════════════════════════════════════════════════════════
// Flow Executor — Motor de ejecución de flujos de automatización
// Procesa nodos de un flujo cuando llega un mensaje o un trigger programado.
// Corre en el contexto de API routes (Node.js, server-side).
// ══════════════════════════════════════════════════════════════════════════════

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import type { Node, Edge } from 'reactflow'
import type { ContextoEjecucion, TriggerTipo } from '@/types/flujos'
import { obtenerHistorialConversacion } from './historial'

type Supa = ReturnType<typeof createAdminClient>

const MAX_PASOS_POR_EJECUCION = 100  // evitar loops infinitos

// ─── Función principal: iniciar flujo cuando llega un mensaje ─────────────────
export async function iniciarFlujoParaConversacion(
  tenantId: string,
  conversacionId: string,
  clienteId: string | null,
  triggerTipo: TriggerTipo | TriggerTipo[],
  flujoId?: string  // opcional: saltarse el lookup por trigger y usar este flujo específico
) {
  const supabase = createAdminClient()
  console.log(`[flow-executor] iniciarFlujo conv=${conversacionId} cliente=${clienteId ?? 'null'} trigger=${JSON.stringify(triggerTipo)}`)

  // Verificar si esta conversación ya tiene una ejecución activa
  const { data: ejecucionExistente, error: errExist } = await supabase
    .from('flujo_ejecuciones')
    .select('id, contexto')
    .eq('conversacion_id', conversacionId)
    .eq('estado', 'activo')
    .maybeSingle()

  if (errExist) console.error(`[flow-executor] error buscando ejecución existente:`, errExist.code, errExist.message)

  if (ejecucionExistente && !flujoId) {
    // Ya hay un flujo corriendo — actualizar contexto con el último mensaje entrante
    // (crítico para flujos Q&A: la condición necesita leer la NUEVA respuesta del usuario)
    const { data: ultimoMsg } = await supabase
      .from('mensajes')
      .select('contenido')
      .eq('conversacion_id', conversacionId)
      .eq('direccion', 'entrante')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ultimoMsg?.contenido) {
      const contextoActual = (ejecucionExistente as Record<string, unknown>).contexto as Record<string, unknown> ?? {}
      await supabase.from('flujo_ejecuciones').update({
        contexto: { ...contextoActual, ultimo_mensaje: ultimoMsg.contenido },
      }).eq('id', ejecucionExistente.id)
    }

    console.log(`[flow-executor] ejecución existente ${ejecucionExistente.id} → continuando`)
    await continuarEjecucion(supabase, ejecucionExistente.id)
    return
  }

  // Buscar el flujo: por ID específico o por trigger_tipo (puede ser array para fallback)
  let flujo: { id: string; nodos: unknown; trigger_tipo: string } | null = null
  if (flujoId) {
    const { data } = await supabase
      .from('flujos_automatizacion')
      .select('id, nodos, trigger_tipo')
      .eq('id', flujoId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    flujo = data
  } else {
    const tipos = Array.isArray(triggerTipo) ? triggerTipo : [triggerTipo]
    for (const tipo of tipos) {
      const { data: flujos } = await supabase
        .from('flujos_automatizacion')
        .select('id, nodos, trigger_tipo')
        .eq('tenant_id', tenantId)
        .eq('activo', true)
        .eq('trigger_tipo', tipo)
      if (flujos?.[0]) {
        flujo = flujos[0]
        break
      }
    }
  }

  if (!flujo) {
    console.log(`[flow-executor] ✗ flujo no encontrado para tenant=${tenantId} trigger=${JSON.stringify(triggerTipo)}`)
    return
  }
  console.log(`[flow-executor] flujo encontrado: ${flujo.id} trigger_tipo=${flujo.trigger_tipo}`)

  await crearYArrancarEjecucion(supabase, tenantId, conversacionId, clienteId, flujo, { marcarAutomatizado: true })
}

// ─── Arranca una ejecución nueva para un flujo ya resuelto ────────────────────
async function crearYArrancarEjecucion(
  supabase: Supa,
  tenantId: string,
  conversacionId: string,
  clienteId: string | null,
  flujo: { id: string; nodos: unknown },
  opciones: { marcarAutomatizado: boolean }
) {
  if (clienteId) {
    const { data: cliente } = await supabase.from('clientes').select('bot_bloqueado').eq('id', clienteId).maybeSingle()
    if (cliente?.bot_bloqueado) {
      console.log(`[flow-executor] cliente ${clienteId} tiene el bot bloqueado — no se arranca el flujo`)
      return
    }
  }

  const nodos = flujo.nodos as { nodes: Node[]; edges: Edge[] } | null
  if (!nodos?.nodes?.length) {
    console.log(`[flow-executor] ✗ flujo ${flujo.id} sin nodos`)
    return
  }

  const nodoTrigger = nodos.nodes.find(n => n.type === 'trigger')
  if (!nodoTrigger) {
    console.log(`[flow-executor] ✗ no hay nodo tipo 'trigger' en el flujo ${flujo.id}`)
    return
  }
  console.log(`[flow-executor] nodoTrigger=${nodoTrigger.id} → insertando ejecución para flujo ${flujo.id}...`)

  const contexto = await construirContexto(supabase, tenantId, conversacionId, clienteId)

  const { data: ejecucion, error: errEjec } = await supabase
    .from('flujo_ejecuciones')
    .insert({
      tenant_id:       tenantId,
      flujo_id:        flujo.id,
      conversacion_id: conversacionId,
      cliente_id:      clienteId,
      estado:          'activo',
      nodo_actual_id:  nodoTrigger.id,
      contexto,
    })
    .select('id')
    .single()

  if (errEjec) console.error(`[flow-executor] ✗ error INSERT flujo_ejecuciones:`, errEjec.code, errEjec.message)
  if (!ejecucion) {
    console.log(`[flow-executor] ✗ ejecución no creada (data null)`)
    return
  }
  console.log(`[flow-executor] ✓ ejecución creada: ${ejecucion.id}`)

  // Marcar cliente como "el bot le está escribiendo" — solo aplica a flujos conversacionales
  // (mensajería). Las automatizaciones de pipeline corren en silencio, sin este badge.
  if (clienteId && opciones.marcarAutomatizado) {
    await supabase.from('clientes')
      .update({ automatizado: true, flujo_activo_id: flujo.id })
      .eq('id', clienteId)
  }

  await continuarEjecucion(supabase, ejecucion.id)
}

// ─── Disparar automatizaciones de pipeline (grupo "automatizaciones") ─────────
// A diferencia de los flujos de mensajería (un solo flujo activo por conversación,
// pensado para una conversación de bot secuencial), aquí SÍ se evalúan y arrancan
// TODAS las automatizaciones activas cuyo disparador coincida — pueden correr varias
// en paralelo entre sí y en paralelo con el flujo de mensajería que esté activo en
// esa conversación, sin pisarse.
export async function dispararAutomatizacionesEtapa(
  tenantId: string,
  conversacionId: string,
  clienteId: string | null,
  nuevaEtapa: string,
) {
  const supabase = createAdminClient()

  const { data: flujos } = await supabase
    .from('flujos_automatizacion')
    .select('id, nodos')
    .eq('tenant_id', tenantId)
    .eq('activo', true)
    .eq('trigger_tipo', 'etapa_cambiada')

  if (!flujos?.length) return

  for (const flujo of flujos) {
    const nodos = flujo.nodos as { nodes: Node[]; edges: Edge[] } | null
    const nodoTrigger = nodos?.nodes?.find(n => n.type === 'trigger')
    const etapaTrigger = String((nodoTrigger?.data as Record<string, unknown> | undefined)?.etapa_trigger ?? '')

    // Etapa_trigger vacío = "cualquier etapa"; si no, debe coincidir exactamente
    if (etapaTrigger && etapaTrigger !== nuevaEtapa) continue

    // Evitar arrancar dos veces la MISMA automatización si ya tiene una ejecución
    // activa para este cliente (ej. está pausada en "esperar días en etapa")
    const { data: existente } = await supabase
      .from('flujo_ejecuciones')
      .select('id')
      .eq('conversacion_id', conversacionId)
      .eq('flujo_id', flujo.id)
      .eq('estado', 'activo')
      .maybeSingle()

    if (existente) {
      console.log(`[flow-executor] automatización ${flujo.id} ya tiene una ejecución activa — se omite`)
      continue
    }

    await crearYArrancarEjecucion(supabase, tenantId, conversacionId, clienteId, flujo, { marcarAutomatizado: false })
  }
}

// ─── Continuar ejecución pendiente (llamado por cron o tras recibir mensaje) ──
export async function continuarEjecucion(supabase: Supa, ejecucionId: string) {
  const { data: ejec } = await supabase
    .from('flujo_ejecuciones')
    .select('*')
    .eq('id', ejecucionId)
    .single()

  if (!ejec || ejec.estado !== 'activo') return

  const { data: flujoRow } = await supabase
    .from('flujos_automatizacion')
    .select('nodos, tenant_id')
    .eq('id', ejec.flujo_id)
    .single()

  if (!flujoRow?.nodos) {
    await marcarError(supabase, ejecucionId, 'Flujo sin nodos')
    return
  }

  const { nodes, edges } = flujoRow.nodos as { nodes: Node[]; edges: Edge[] }
  const tenantId: string = flujoRow.tenant_id

  let nodoActualId: string = ejec.nodo_actual_id ?? ''
  let pasos = ejec.pasos_ejecutados ?? 0
  let contexto: ContextoEjecucion = ejec.contexto ?? {}

  // Loop de procesamiento de nodos
  while (pasos < MAX_PASOS_POR_EJECUCION) {
    if (!nodoActualId) break

    const nodo = nodes.find(n => n.id === nodoActualId)
    if (!nodo) break

    pasos++

    // Actualizar estado en DB
    await supabase.from('flujo_ejecuciones').update({
      nodo_actual_id: nodoActualId,
      pasos_ejecutados: pasos,
      updated_at: new Date().toISOString(),
    }).eq('id', ejecucionId)

    const resultado = await procesarNodo(supabase, nodo, ejec, contexto, tenantId, nodes, edges)

    await registrarPaso(supabase, ejecucionId, tenantId, nodo.id, nodo.type ?? null, resultado)

    if (resultado.tipo === 'pausar') {
      if (resultado.contexto) contexto = { ...contexto, ...(resultado.contexto as Partial<ContextoEjecucion>) }
      await supabase.from('flujo_ejecuciones').update({
        proxima_ejecucion_at: resultado.proxima_ejecucion_at,
        nodo_actual_id:       resultado.siguiente_nodo_id ?? nodoActualId,
        pasos_ejecutados:     pasos,
        contexto,
        updated_at: new Date().toISOString(),
      }).eq('id', ejecucionId)
      return
    }

    if (resultado.tipo === 'error') {
      await marcarError(supabase, ejecucionId, resultado.error ?? 'Error desconocido')
      return
    }

    if (resultado.tipo === 'fin') {
      await supabase.from('flujo_ejecuciones').update({
        estado:   'completado',
        pasos_ejecutados: pasos,
        contexto,
        updated_at: new Date().toISOString(),
      }).eq('id', ejecucionId)

      // Limpiar automatizado del cliente — solo si ESTA ejecución era la que estaba
      // marcada como activa (evita que una automatización de pipeline en paralelo
      // apague el badge de un flujo de mensajería real que sigue corriendo)
      if (ejec.cliente_id) {
        await supabase.from('clientes')
          .update({ automatizado: false, flujo_activo_id: null })
          .eq('id', ejec.cliente_id as string)
          .eq('flujo_activo_id', ejec.flujo_id as string)
      }
      return
    }

    if (resultado.contexto) contexto = { ...contexto, ...resultado.contexto }

    // Avanzar al siguiente nodo
    nodoActualId = resultado.siguiente_nodo_id ?? ''
    if (!nodoActualId) break
  }

  // Si llegamos aquí sin fin: guardar el estado actual
  await supabase.from('flujo_ejecuciones').update({
    nodo_actual_id: nodoActualId,
    pasos_ejecutados: pasos,
    contexto,
    updated_at: new Date().toISOString(),
  }).eq('id', ejecucionId)
}

// ─── Procesar ejecuciones con delay que ya vencieron (llamado por cron) ────────
export async function procesarEjecucionesPendientes(tenantId?: string) {
  const supabase = createAdminClient()
  const ahora = new Date().toISOString()

  let q = supabase
    .from('flujo_ejecuciones')
    .select('id')
    .eq('estado', 'activo')
    .lte('proxima_ejecucion_at', ahora)
    .not('proxima_ejecucion_at', 'is', null)

  if (tenantId) q = q.eq('tenant_id', tenantId)

  const { data: pendientes } = await q.limit(50)

  if (!pendientes?.length) return 0

  await Promise.allSettled(
    pendientes.map(e => continuarEjecucion(supabase, e.id))
  )

  return pendientes.length
}

// ─── Procesador de nodos individuales ────────────────────────────────────────
type ResultadoNodo =
  | { tipo: 'continuar'; siguiente_nodo_id: string | null; contexto?: Partial<ContextoEjecucion>; advertencia?: string }
  | { tipo: 'pausar'; proxima_ejecucion_at: string; siguiente_nodo_id: string | null; contexto?: Partial<Record<string, unknown>> }
  | { tipo: 'fin' }
  | { tipo: 'error'; error: string }

async function procesarNodo(
  supabase: Supa,
  nodo: Node,
  ejec: Record<string, unknown>,
  contexto: ContextoEjecucion,
  tenantId: string,
  nodes: Node[],
  edges: Edge[]
): Promise<ResultadoNodo> {
  const data = nodo.data as Record<string, unknown>
  const convId = ejec.conversacion_id as string | null
  const clienteId = ejec.cliente_id as string | null

  switch (nodo.type) {
    // ── Trigger: simplemente avanzar al primer nodo conectado ────────────────
    case 'trigger': {
      const sig = getSiguienteNodo(edges, nodo.id)
      return { tipo: 'continuar', siguiente_nodo_id: sig }
    }

    // ── Enviar mensaje de texto ───────────────────────────────────────────────
    case 'mensaje': {
      const contenido = String(data.contenido ?? '')
      if (!contenido.trim() || !convId) {
        return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
      }

      const textoFinal = interpolarVariables(contenido, contexto)
      await enviarMensajeDirecto(supabase, tenantId, convId, textoFinal, 'texto')
      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
    }

    // ── Enviar plantilla Meta aprobada ────────────────────────────────────────
    case 'plantilla': {
      const plantillaId = String(data.plantilla_id ?? '')
      if (!plantillaId || !convId) {
        return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
      }

      try {
        const { data: plantilla } = await supabase
          .from('plantillas_mensajes')
          .select('meta_template_name, meta_language_code, meta_status, categoria')
          .eq('id', plantillaId)
          .maybeSingle()

        if (plantilla?.meta_status === 'aprobada' && plantilla.meta_template_name) {
          const { data: conv } = await supabase
            .from('conversaciones')
            .select('canal, canal_contact_id')
            .eq('id', convId)
            .maybeSingle()

          if (conv?.canal === 'whatsapp') {
            await enviarPlantillaWhatsApp(
              supabase, tenantId, convId, conv.canal_contact_id,
              plantilla.meta_template_name, plantilla.meta_language_code ?? 'es',
              contexto, data.variables as Record<string, string> | undefined
            )
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido'
        console.error('[flow-executor] Error plantilla:', e)
        return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id), advertencia: msg }
      }

      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
    }

    // ── Enviar media (imagen/documento/audio) ─────────────────────────────────
    case 'media': {
      const mediaUrl = String(data.media_url ?? '')
      const mediaTipo = String(data.media_tipo ?? 'imagen')
      const caption = String(data.media_caption ?? '')

      if (mediaUrl && convId) {
        try {
          const { data: conv } = await supabase
            .from('conversaciones')
            .select('canal, canal_contact_id')
            .eq('id', convId)
            .maybeSingle()

          if (conv?.canal === 'whatsapp') {
            await enviarMediaWhatsApp(
              supabase, tenantId, convId, conv.canal_contact_id,
              mediaTipo as 'imagen' | 'documento' | 'audio' | 'video', mediaUrl, caption
            )
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Error desconocido'
          console.error('[flow-executor] Error media:', e)
          return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id), advertencia: msg }
        }
      }
      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
    }

    // ── Condición (bifurcación con ramas AND/OR + fallback) ───────────────────
    case 'condicion': {
      const ramas = (data.ramas ?? []) as { id: string; modo?: string; condiciones?: { tipo: string; valor?: string; agente_id?: string; pregunta?: string }[] }[]

      for (const rama of ramas) {
        const condiciones = rama.condiciones ?? []
        if (condiciones.length === 0) continue
        const modoAND = (rama.modo ?? 'todas') === 'todas'
        const resultados = await Promise.all(
          condiciones.map(c => evaluarCondicionSimple(supabase, tenantId, c.tipo, String(c.valor ?? ''), contexto, convId, clienteId, c.agente_id, c.pregunta))
        )
        const cumple = modoAND ? resultados.every(Boolean) : resultados.some(Boolean)
        console.log(`[condicion] rama=${rama.id} modo=${rama.modo} resultados=[${resultados.join(',')}] cumple=${cumple}`)
        if (cumple) {
          const siguiente = getSiguienteNodoConSalida(edges, nodo.id, rama.id)
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }
        }
      }

      // Ninguna rama coincide → salida "default" (fallback)
      const siguienteDefault = getSiguienteNodoConSalida(edges, nodo.id, 'default')
      return { tipo: 'continuar', siguiente_nodo_id: siguienteDefault }
    }

    // ── Dividir tráfico (reparto ponderado aleatorio entre variaciones) ──────
    case 'dividir_trafico': {
      const variaciones = (data.variaciones ?? []) as { id: string; nombre?: string; porcentaje?: number }[]
      if (!variaciones.length) return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }

      const total = variaciones.reduce((s, v) => s + (Number(v.porcentaje) || 0), 0) || 100
      let r = Math.random() * total
      let elegida = variaciones[0]
      for (const v of variaciones) {
        r -= (Number(v.porcentaje) || 0)
        if (r <= 0) { elegida = v; break }
      }

      const siguiente = getSiguienteNodoConSalida(edges, nodo.id, elegida.id)
      console.log(`[dividir_trafico] elegida=${elegida.nombre ?? elegida.id}`)
      return {
        tipo: 'continuar',
        siguiente_nodo_id: siguiente,
        contexto: { variables: { ...(contexto.variables ?? {}), [`${nodo.id}_variacion`]: elegida.nombre ?? elegida.id } },
      }
    }

    // ── Esperar (duración fija, hasta respuesta, o días en la etapa actual) ───
    case 'esperar': {
      const modo = String(data.modo ?? 'duracion')
      const siguienteId = getSiguienteNodo(edges, nodo.id)
      const lejano = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString()

      if (modo === 'dias_en_etapa') {
        const dias = Number(data.dias ?? 1)
        if (!clienteId) return { tipo: 'continuar', siguiente_nodo_id: siguienteId }

        const { data: historial } = await supabase
          .from('historial_etapas_cliente')
          .select('created_at')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const desde = historial?.created_at ? new Date(historial.created_at).getTime() : Date.now()
        const objetivo = desde + dias * 86_400_000
        if (Date.now() >= objetivo) return { tipo: 'continuar', siguiente_nodo_id: siguienteId }
        return { tipo: 'pausar', proxima_ejecucion_at: new Date(objetivo).toISOString(), siguiente_nodo_id: nodo.id }
      }

      // Si el siguiente nodo es menu_opciones/capturar_dato con prompt, pre-marcar
      // para que la respuesta del cliente se evalúe directamente sin fase extra
      const siguienteNodo = nodes.find(n => n.id === siguienteId)
      const ctxExtra = siguienteNodo?.type === 'menu_opciones' ? { _menu_esperando: siguienteId }
        : siguienteNodo?.type === 'capturar_dato' ? { _captura_esperando: siguienteId }
        : {}

      if (modo === 'respuesta') {
        return { tipo: 'pausar', proxima_ejecucion_at: lejano, siguiente_nodo_id: siguienteId, contexto: ctxExtra }
      }

      const horas = Number(data.horas ?? 24)
      const minutos = Number(data.minutos ?? 0)
      const totalMs = (horas * 3600 + minutos * 60) * 1000
      const proxima = new Date(Date.now() + totalMs).toISOString()
      return { tipo: 'pausar', proxima_ejecucion_at: proxima, siguiente_nodo_id: siguienteId, contexto: ctxExtra }
    }

    // ── Saltar a otro nodo del flujo (goto / loop-back) ──────────────────────
    case 'ir_a_nodo': {
      const destinoId = String(data.nodo_destino_id ?? '').trim()
      if (!destinoId) return { tipo: 'continuar', siguiente_nodo_id: null }
      const existe = nodes.find(n => n.id === destinoId)
      if (!existe) return { tipo: 'continuar', siguiente_nodo_id: null }
      // Siempre pausa: reanuda en el nodo destino al recibir el próximo mensaje.
      // Esto evita bucles infinitos dentro del mismo ciclo de ejecución.
      const lejano = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString()
      return { tipo: 'pausar', proxima_ejecucion_at: lejano, siguiente_nodo_id: destinoId }
    }

    // ── Capturar dato — opcionalmente pregunta, valida formato, reintenta ────
    case 'capturar_dato': {
      const campo = String(data.campo ?? 'nombre')
      const nombreVar = campo === 'variable' ? String(data.nombre_variable ?? 'dato') : campo
      const prompt = String(data.prompt ?? '').trim()
      const formato = String(data.formato_esperado ?? '') as '' | 'texto' | 'email' | 'telefono' | 'numero' | 'fecha'
      const mensajeReintento = String(data.mensaje_reintento ?? 'No entendí tu respuesta, ¿puedes intentar de nuevo?')
      const ctx = contexto as Record<string, unknown>
      const lejano = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString()

      // FASE 1: si tiene prompt propio y aún no se envió/esperó, enviarlo y pausar
      if (prompt && ctx._captura_esperando !== nodo.id) {
        if (convId) await enviarMensajeDirecto(supabase, tenantId, convId, interpolarVariables(prompt, contexto), 'texto')
        return { tipo: 'pausar', proxima_ejecucion_at: lejano, siguiente_nodo_id: nodo.id, contexto: { _captura_esperando: nodo.id } }
      }
      delete ctx._captura_esperando

      const valor = (contexto.ultimo_mensaje ?? '').trim()

      if (valor && formato && !validarFormato(formato, valor)) {
        if (convId) await enviarMensajeDirecto(supabase, tenantId, convId, mensajeReintento, 'texto')
        return { tipo: 'pausar', proxima_ejecucion_at: lejano, siguiente_nodo_id: nodo.id, contexto: { _captura_esperando: nodo.id } }
      }

      if (valor) {
        const nuevasVars = { ...(contexto.variables ?? {}), [nombreVar]: valor }
        const camposDB: Record<string, string> = { nombre: 'nombre', celular: 'celular', email: 'email', cedula: 'cedula' }

        if (clienteId && camposDB[campo]) {
          await supabase.from('clientes').update({ [camposDB[campo]]: valor }).eq('id', clienteId)
          const ctxUpdate: Partial<ContextoEjecucion> = { variables: nuevasVars }
          if (campo === 'nombre') ctxUpdate.nombre_cliente = valor
          if (campo === 'celular') ctxUpdate.celular_cliente = valor
          return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id), contexto: ctxUpdate }
        }

        return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id), contexto: { variables: nuevasVars } }
      }

      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
    }

    // ── Menú de opciones — dos fases: 1) pausar y esperar; 2) evaluar respuesta ─
    case 'menu_opciones': {
      const cantidad    = Number(data.cantidad ?? 3)
      const rawOpciones = (data.opciones ?? []) as { tipo_match?: string; valor_match?: string }[]
      const ctx         = contexto as Record<string, unknown>
      const lejano      = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString()

      // FASE 1: primera vez que el flujo llega aquí → pausar y esperar respuesta del cliente
      if (ctx._menu_esperando !== nodo.id) {
        console.log(`[menu_opciones] fase 1 — pausando en nodo ${nodo.id}`)
        return { tipo: 'pausar', proxima_ejecucion_at: lejano, siguiente_nodo_id: nodo.id, contexto: { _menu_esperando: nodo.id } }
      }

      // FASE 2: cliente ya respondió → evaluar ultimo_mensaje
      delete ctx._menu_esperando
      const raw       = String(contexto.ultimo_mensaje ?? '')
      const ultimoMsg = raw.replace(/^[\s.,!?¿¡\n\r]+|[\s.,!?¿¡\n\r]+$/g, '')
      const ultimoLow = ultimoMsg.toLowerCase()
      console.log(`[menu_opciones] fase 2 — evaluando: "${ultimoMsg}"`)

      for (let i = 0; i < cantidad; i++) {
        const op    = rawOpciones[i] ?? {}
        const tipo  = op.tipo_match ?? 'numero'
        const valor = (op.valor_match ?? '').trim().toLowerCase()
        const num   = i + 1
        let match   = false

        switch (tipo) {
          case 'numero': {
            const soloChars = ultimoMsg.replace(/[.,!?¿¡\s]/g, '')
            match = soloChars === String(num)
            break
          }
          case 'exacto':      match = Boolean(valor) && ultimoLow === valor; break
          case 'contiene':    match = Boolean(valor) && ultimoLow.includes(valor); break
          case 'no_contiene': match = Boolean(valor) && !ultimoLow.includes(valor); break
        }

        console.log(`[menu_opciones] opción ${num} (${tipo}="${valor}"): match=${match}`)
        if (match) {
          const siguiente = getSiguienteNodoConSalida(edges, nodo.id, String(num))
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }
        }
      }

      // Ninguna coincide → siempre sale por "otro" (o fin si no está conectado)
      const otraSalida = getSiguienteNodoConSalida(edges, nodo.id, 'otro')
      console.log(`[menu_opciones] sin coincidencia → otro=${otraSalida}`)
      return { tipo: 'continuar', siguiente_nodo_id: otraSalida }
    }

    // ── Acción (nodo único estilo LucidBot: una categoría + sus campos) ───────
    case 'accion': {
      const categoria = String(data.categoria ?? '')
      const siguiente = getSiguienteNodo(edges, nodo.id)

      switch (categoria) {
        // ── Bandeja de Entrada (submenú con su propio subtipo) ─────────────
        case 'bandeja_entrada': {
          const subtipo = String(data.subtipo_bandeja ?? '')
          switch (subtipo) {
            case 'transferir_humano':
              // Termina la automatización — la limpieza de clientes.automatizado
              // la hace el manejo de 'fin' en continuarEjecucion.
              return { tipo: 'fin' }

            case 'transferir_bot': {
              const subflujoId = String(data.subflujo_id ?? '').trim()
              if (subflujoId && convId) {
                iniciarFlujoParaConversacion(tenantId, convId, clienteId, 'mensaje_nuevo', subflujoId)
                  .catch(e => console.error('[flow-executor] Error transferir_bot:', e))
              }
              return { tipo: 'fin' }
            }

            case 'archivar':
              if (convId) await supabase.from('conversaciones').update({ estado: 'archivada' }).eq('id', convId)
              return { tipo: 'continuar', siguiente_nodo_id: siguiente }

            case 'desarchivar':
              if (convId) await supabase.from('conversaciones').update({ estado: 'abierta' }).eq('id', convId)
              return { tipo: 'continuar', siguiente_nodo_id: siguiente }

            case 'marcar_seguimiento':
              if (convId) await supabase.from('conversaciones').update({ estado: 'pendiente' }).eq('id', convId)
              return { tipo: 'continuar', siguiente_nodo_id: siguiente }

            case 'quitar_seguimiento':
              if (convId) await supabase.from('conversaciones').update({ estado: 'abierta' }).eq('id', convId)
              return { tipo: 'continuar', siguiente_nodo_id: siguiente }

            case 'bloquear_usuario':
              if (clienteId) await supabase.from('clientes').update({ bot_bloqueado: true }).eq('id', clienteId)
              return { tipo: 'fin' }

            case 'desbloquear_usuario':
              if (clienteId) await supabase.from('clientes').update({ bot_bloqueado: false }).eq('id', clienteId)
              return { tipo: 'continuar', siguiente_nodo_id: siguiente }

            case 'anadir_nota': {
              const contenido = String(data.contenido ?? '')
              if (contenido.trim() && convId) {
                await supabase.from('mensajes').insert({
                  conversacion_id: convId, tenant_id: tenantId, direccion: 'saliente', tipo: 'nota_interna',
                  contenido: interpolarVariables(contenido, contexto), enviado_por: null, estado_envio: 'enviado', leido_por_asesor: false,
                })
              }
              return { tipo: 'continuar', siguiente_nodo_id: siguiente }
            }

            case 'cambiar_etapa': {
              const etapa = String(data.etapa ?? '')
              if (etapa && clienteId) {
                const { ETAPA_MAP, ETAPAS } = await import('@/lib/ventas/pipeline')
                const etapaInfo = ETAPA_MAP[etapa as keyof typeof ETAPA_MAP]
                if (etapaInfo) {
                  const orden = ETAPAS.findIndex(e => e.id === etapa)
                  await supabase.from('clientes')
                    .update({ etapa_venta: etapa, etapa_venta_orden: orden >= 0 ? orden : 0, en_seguimiento_ventas: true })
                    .eq('id', clienteId)
                  try {
                    await supabase.from('historial_etapas_cliente').insert({
                      cliente_id: clienteId, tenant_id: tenantId, etapa_nueva: etapa, origen: 'automatizacion',
                    })
                  } catch { /* non-critical */ }
                }
              }
              return { tipo: 'continuar', siguiente_nodo_id: siguiente, contexto: { etapa_actual: etapa } }
            }

            case 'asignar_admin': {
              if (!convId) return { tipo: 'continuar', siguiente_nodo_id: siguiente }
              if (data.tipo_asignacion === 'usuario_fijo' && data.asignar_a) {
                await supabase.from('conversaciones').update({ assigned_to: String(data.asignar_a) }).eq('id', convId)
                if (clienteId) await supabase.from('clientes').update({ assigned_to: String(data.asignar_a) }).eq('id', clienteId)
              } else {
                const { data: asesores } = await supabase
                  .from('usuarios').select('id').eq('tenant_id', tenantId).in('rol', ['admin', 'gerencia', 'asesor'])
                if (asesores?.length) {
                  let menorCarga = Infinity; let seleccionado = asesores[0].id
                  for (const a of asesores) {
                    const { count } = await supabase.from('conversaciones')
                      .select('id', { count: 'exact', head: true }).eq('assigned_to', a.id).eq('estado', 'abierta')
                    if ((count ?? 0) < menorCarga) { menorCarga = count ?? 0; seleccionado = a.id }
                  }
                  await supabase.from('conversaciones').update({ assigned_to: seleccionado }).eq('id', convId)
                  if (clienteId) await supabase.from('clientes').update({ assigned_to: seleccionado }).eq('id', clienteId)
                }
              }
              return { tipo: 'continuar', siguiente_nodo_id: siguiente }
            }

            default:
              return { tipo: 'continuar', siguiente_nodo_id: siguiente }
          }
        }

        // ── OpenAI — SIEMPRE guarda el resultado en variable, nunca auto-envía ─
        case 'openai': {
          const modo = String(data.modo ?? 'puntual')
          const variableNombre = String(data.variable_nombre ?? '')
          let salida: string | null = null
          let advertencia: string | undefined

          if (modo === 'agente') {
            const agenteId = String(data.agente_id ?? '')
            const promptContexto = String(data.prompt_contexto ?? '')
            if (!agenteId) return { tipo: 'continuar', siguiente_nodo_id: siguiente }
            try {
              const { llamarAgente } = await import('@/lib/ia/llamarAgente')
              const resultado = await llamarAgente({
                tenantId, agenteId, conversacionId: convId, clienteId,
                mensajeCliente: contexto.ultimo_mensaje ?? 'Inicia la conversación con el cliente.',
                promptContextoExtra: promptContexto,
                contextoCliente: { nombre: contexto.nombre_cliente, canal: contexto.canal, etapa: contexto.etapa_actual },
              })
              if (!resultado.ok) advertencia = resultado.error ?? 'Error desconocido'
              salida = resultado.texto
            } catch (e) {
              advertencia = e instanceof Error ? e.message : 'Error desconocido'
              console.error('[flow-executor] Error accion/openai (agente):', e)
            }
          } else {
            const uso = String(data.accion_ia ?? '')
            const promptTemplate = String(data.prompt ?? '')
            if (!uso || !promptTemplate) return { tipo: 'continuar', siguiente_nodo_id: siguiente }
            try {
              const { llamarIA } = await import('@/lib/ia/llamarIA')
              const quiereResumen = !!data.incluir_resumen_conversacion
              const contextoConResumen = quiereResumen && convId
                ? { ...contexto, resumen_conversacion: await obtenerHistorialConversacion(supabase, convId) }
                : contexto
              const instrucciones = interpolarVariables(promptTemplate, contextoConResumen)
              const bloquesContexto: string[] = []
              if (data.incluir_ultimo_mensaje !== false && contexto.ultimo_mensaje) {
                bloquesContexto.push(`Último mensaje del cliente: "${contexto.ultimo_mensaje}"`)
              }
              if (quiereResumen && contextoConResumen.resumen_conversacion) {
                bloquesContexto.push(`Historial reciente de la conversación:\n${contextoConResumen.resumen_conversacion}`)
              }
              const promptFinal = bloquesContexto.length ? `${instrucciones}\n\n${bloquesContexto.join('\n\n')}` : instrucciones
              const proveedor = data.proveedor ? String(data.proveedor) : undefined
              const modelo = data.modelo ? String(data.modelo) : undefined
              const temperatura = data.temperatura !== undefined ? parseFloat(String(data.temperatura)) : undefined
              const maxTokens = data.max_tokens !== undefined ? parseInt(String(data.max_tokens), 10) : undefined
              const resultado = await llamarIA(tenantId, uso, promptFinal, {
                proveedor: proveedor as 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'GROK' | 'ELEVENLABS' | undefined,
                modelo,
                temperatura: isNaN(temperatura as number) ? undefined : temperatura,
                maxTokens: isNaN(maxTokens as number) ? undefined : maxTokens,
              })
              if (!resultado.ok) {
                advertencia = resultado.error ?? 'Error desconocido'
              } else {
                salida = resultado.texto ?? resultado.imagenUrl ?? resultado.audioBase64 ?? ''
              }
            } catch (e) {
              advertencia = e instanceof Error ? e.message : 'Error desconocido'
              console.error('[flow-executor] Error accion/openai (puntual):', e)
            }
          }

          const nuevasVars = variableNombre && salida != null
            ? { ...(contexto.variables ?? {}), [variableNombre]: salida }
            : contexto.variables

          return {
            tipo: 'continuar', siguiente_nodo_id: siguiente,
            contexto: { variables: nuevasVars, respuestas: { ...contexto.respuestas, [nodo.id]: salida ?? '' } },
            advertencia,
          }
        }

        case 'anadir_etiqueta':
        case 'quitar_etiqueta': {
          let etiquetaId = String(data.etiqueta_id ?? '').trim()
          const nuevaNombre = String(data.nueva_etiqueta_nombre ?? '').trim()
          const nuevaColor = String(data.nueva_etiqueta_color ?? '#3b82f6')

          if (!etiquetaId && nuevaNombre && clienteId) {
            const { data: existente } = await supabase.from('etiquetas').select('id')
              .eq('tenant_id', tenantId).ilike('nombre', nuevaNombre).maybeSingle()
            if (existente) etiquetaId = existente.id
            else {
              const { data: creada } = await supabase.from('etiquetas')
                .insert({ tenant_id: tenantId, nombre: nuevaNombre, color: nuevaColor }).select('id').single()
              if (creada) etiquetaId = creada.id
            }
          }

          if (etiquetaId && clienteId) {
            if (categoria === 'anadir_etiqueta') {
              await supabase.from('clientes_etiquetas').upsert(
                { cliente_id: clienteId, etiqueta_id: etiquetaId, tenant_id: tenantId },
                { onConflict: 'cliente_id,etiqueta_id' }
              )
            } else {
              await supabase.from('clientes_etiquetas').delete().eq('cliente_id', clienteId).eq('etiqueta_id', etiquetaId)
            }
          }
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }
        }

        // ── Notificar a administradores (push) ─────────────────────────────
        case 'notificar_admin': {
          const titulo = interpolarVariables(String(data.notif_titulo ?? 'Automatización'), contexto)
          const mensaje = interpolarVariables(String(data.notif_mensaje ?? ''), contexto)
          try {
            const { sendPushToTenant } = await import('@/lib/mensajeria/push')
            await sendPushToTenant(tenantId, titulo, mensaje || 'Un flujo necesita tu atención', 'flujo-accion')
          } catch (e) {
            console.error('[flow-executor] Error notificar_admin:', e)
          }
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }
        }

        // ── Establecer / limpiar campo personalizado (variable del flujo) ──
        case 'campo_set': {
          const nombreVar = String(data.variable_nombre ?? '').trim()
          if (!nombreVar) return { tipo: 'continuar', siguiente_nodo_id: siguiente }
          const valor = interpolarVariables(String(data.variable_valor ?? ''), contexto)
          return { tipo: 'continuar', siguiente_nodo_id: siguiente, contexto: { variables: { ...(contexto.variables ?? {}), [nombreVar]: valor } } }
        }

        case 'campo_clear': {
          const nombreVar = String(data.variable_nombre ?? '').trim()
          if (!nombreVar) return { tipo: 'continuar', siguiente_nodo_id: siguiente }
          const nuevas = { ...(contexto.variables ?? {}) }
          delete nuevas[nombreVar]
          return { tipo: 'continuar', siguiente_nodo_id: siguiente, contexto: { variables: nuevas } }
        }

        // ── Suscribir / dar de baja de secuencia de mensajes ───────────────
        case 'secuencia_sub': {
          const secuenciaId = String(data.secuencia_id ?? '').trim()
          if (secuenciaId && clienteId) {
            await supabase.from('secuencia_suscripciones').upsert(
              { tenant_id: tenantId, secuencia_id: secuenciaId, cliente_id: clienteId, conversacion_id: convId, activa: true, paso_actual: 0, proxima_ejecucion_at: new Date().toISOString() },
              { onConflict: 'secuencia_id,cliente_id' }
            )
          }
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }
        }

        case 'secuencia_unsub': {
          const secuenciaId = String(data.secuencia_id ?? '').trim()
          if (secuenciaId && clienteId) {
            await supabase.from('secuencia_suscripciones').update({ activa: false })
              .eq('secuencia_id', secuenciaId).eq('cliente_id', clienteId)
          }
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }
        }

        // ── Registrar evento personalizado ──────────────────────────────────
        case 'evento_log': {
          const nombreEvento = String(data.variable_valor ?? '').trim() || 'evento'
          let datos: unknown = null
          try { datos = data.evento_datos ? JSON.parse(interpolarVariables(String(data.evento_datos), contexto)) : null } catch { datos = String(data.evento_datos ?? '') }
          await supabase.from('eventos_personalizados').insert({
            tenant_id: tenantId, cliente_id: clienteId, conversacion_id: convId, nombre_evento: nombreEvento, datos,
          })
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }
        }

        // ── Suscribir / dar de baja de transmisiones (opt-in de mensajes masivos) ─
        case 'transmision_sub':
          if (clienteId) await supabase.from('clientes').update({ recibe_transmisiones: true }).eq('id', clienteId)
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }

        case 'transmision_unsub':
          if (clienteId) await supabase.from('clientes').update({ recibe_transmisiones: false }).eq('id', clienteId)
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }

        case 'borrar_datos_usuario':
          // Borra solo las variables que el flujo capturó (no toca los datos reales del cliente en el CRM).
          return { tipo: 'continuar', siguiente_nodo_id: siguiente, contexto: { variables: {} } }

        // ── Solicitud de API externa ─────────────────────────────────────────
        case 'api_externa': {
          const url = String(data.api_url ?? '').trim()
          if (!url) return { tipo: 'continuar', siguiente_nodo_id: siguiente }
          const metodo = String(data.api_metodo ?? 'GET')
          const headers: Record<string, string> = {}
          for (const linea of String(data.api_headers ?? '').split('\n')) {
            const i = linea.indexOf(':')
            if (i > 0) headers[linea.slice(0, i).trim()] = interpolarVariables(linea.slice(i + 1).trim(), contexto)
          }
          const variableRespuesta = String(data.api_variable_respuesta ?? '').trim()
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 10_000)
            const r = await fetch(url, {
              method: metodo,
              headers: { 'Content-Type': 'application/json', ...headers },
              body: metodo !== 'GET' && data.api_body ? interpolarVariables(String(data.api_body), contexto) : undefined,
              signal: controller.signal,
            })
            clearTimeout(timeout)
            const texto = await r.text()
            if (variableRespuesta) {
              return { tipo: 'continuar', siguiente_nodo_id: siguiente, contexto: { variables: { ...(contexto.variables ?? {}), [variableRespuesta]: texto.slice(0, 4000) } } }
            }
            return { tipo: 'continuar', siguiente_nodo_id: siguiente }
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Error desconocido'
            console.error('[flow-executor] Error api_externa:', e)
            return { tipo: 'continuar', siguiente_nodo_id: siguiente, advertencia: msg }
          }
        }

        // ── Disparador: entrega la conversación a otro flujo y termina ──────
        case 'disparador': {
          const subflujoId = String(data.subflujo_id ?? '').trim()
          if (subflujoId && convId) {
            iniciarFlujoParaConversacion(tenantId, convId, clienteId, 'mensaje_nuevo', subflujoId)
              .catch(e => console.error('[flow-executor] Error disparador:', e))
          }
          return { tipo: 'fin' }
        }

        default:
          return { tipo: 'continuar', siguiente_nodo_id: siguiente }
      }
    }

    // ── Subflujo (ejecutar otro flujo anidado y seguir) ───────────────────────
    case 'subflujo': {
      const subflujoId = String(data.subflujo_id ?? '').trim()
      if (subflujoId && convId) {
        iniciarFlujoParaConversacion(tenantId, convId, clienteId, 'mensaje_nuevo', subflujoId)
          .catch(e => console.error('[flow-executor] Error subflujo:', e))
      }
      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
    }

    // ── Fin del flujo ─────────────────────────────────────────────────────────
    case 'fin':
      return { tipo: 'fin' }

    default:
      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
  }
}


// ─── Evalúa una condición simple (reutilizado dentro de ramas AND/OR) ────────
async function evaluarCondicionSimple(
  supabase: Supa, tenantId: string, tipo: string, valor: string,
  contexto: ContextoEjecucion, convId: string | null, clienteId: string | null,
  agenteId?: string, pregunta?: string,
): Promise<boolean> {
  const ultimoMsg = (contexto.ultimo_mensaje ?? '').trim()
  const ultimoMsgLower = ultimoMsg.toLowerCase()
  const condicionValor = valor.trim()

  switch (tipo) {
    case 'canal': {
      const { data: conv } = await supabase.from('conversaciones').select('canal').eq('id', convId ?? '').maybeSingle()
      return conv?.canal === condicionValor
    }
    case 'etapa':
      return (contexto.etapa_actual ?? '') === condicionValor
    case 'etapa_o_posterior': {
      const { ETAPAS } = await import('@/lib/ventas/pipeline')
      const ordenActual = ETAPAS.findIndex(e => e.id === contexto.etapa_actual)
      const ordenObjetivo = ETAPAS.findIndex(e => e.id === condicionValor)
      return ordenActual >= 0 && ordenObjetivo >= 0 && ordenActual >= ordenObjetivo
    }
    case 'aprobacion_pendiente': {
      if (!clienteId) return false
      const { data: cl } = await supabase.from('clientes').select('estado_aprobacion_matricula').eq('id', clienteId).maybeSingle()
      return cl?.estado_aprobacion_matricula !== 'aprobado'
    }
    case 'tiene_celular': {
      if (!clienteId) return false
      const { data: cl } = await supabase.from('clientes').select('celular').eq('id', clienteId).maybeSingle()
      return !!(cl?.celular?.trim())
    }
    case 'es_nuevo':
      return contexto.etapa_actual === 'nuevo_mensaje' || contexto.etapa_actual === 'nuevo'
    case 'respuesta_contiene':
      return ultimoMsgLower.includes(condicionValor.toLowerCase())
    case 'palabras_clave': {
      const palabras = condicionValor.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
      const msgTokens = ultimoMsgLower.split(/[\s,;.!?¿¡\-_/\\|()[\]{}]+/).filter(Boolean)
      return palabras.some(p => msgTokens.includes(p))
    }
    case 'contiene_todas': {
      const palabras = condicionValor.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
      const msgTokens = ultimoMsgLower.split(/[\s,;.!?¿¡\-_/\\|()[\]{}]+/).filter(Boolean)
      return palabras.length > 0 && palabras.every(p => msgTokens.includes(p))
    }
    case 'es_exactamente':
      return ultimoMsgLower === condicionValor.toLowerCase()
    case 'empieza_con':
      return ultimoMsgLower.startsWith(condicionValor.toLowerCase())
    case 'termina_con':
      return ultimoMsgLower.endsWith(condicionValor.toLowerCase())
    case 'longitud_mayor': {
      const n = parseInt(condicionValor) || 10
      return ultimoMsg.length > n
    }
    case 'es_positivo': {
      const positivos = ['sí','si','claro','dale','ok','bueno','bien','correcto','exacto',
        'afirmativo','listo','perfecto','va','sip','seee','yep','yes','obvio']
      const msgTokens = ultimoMsgLower.split(/[\s,;.!?¿¡\-_/\\|()[\]{}]+/).filter(Boolean)
      return positivos.some(p => msgTokens.includes(p))
    }
    case 'es_negativo': {
      const negativos = ['no','nop','nope','tampoco','negativo','nel','nada','negado']
      const msgTokens = ultimoMsgLower.split(/[\s,;.!?¿¡\-_/\\|()[\]{}]+/).filter(Boolean)
      return negativos.some(p => msgTokens.includes(p))
    }
    case 'es_numero':
      return /^\s*\d+([.,]\d+)?\s*$/.test(ultimoMsg)
    case 'horario_laboral': {
      const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
      const dia = ahora.getDay()
      const hora = ahora.getHours()
      return dia >= 1 && dia <= 6 && hora >= 7 && hora < 18
    }
    case 'ia_evalua': {
      if (!agenteId || !pregunta || !ultimoMsg) return false

      const [{ data: agente }, { data: apiCfg }] = await Promise.all([
        supabase.from('agentes_ia').select('proveedor,modelo').eq('id', agenteId).maybeSingle(),
        supabase.from('config_apis_ia').select('openai_key_enc,anthropic_key_enc,openai_modelo_default,anthropic_modelo_default').eq('tenant_id', tenantId).maybeSingle(),
      ])
      if (!agente || !apiCfg) return false

      const systemPrompt = 'Eres un evaluador. Lee el mensaje del cliente y responde SOLO con "SÍ" o "NO". Sin explicaciones, sin puntuación extra, solo SÍ o NO.'
      const userPrompt = `Mensaje del cliente: "${ultimoMsg}"\n\nPregunta: ${pregunta}\n\nResponde SÍ o NO:`
      let respuestaIA = ''

      if (agente.proveedor === 'openai' && apiCfg.openai_key_enc) {
        let key = apiCfg.openai_key_enc
        try { key = (await import('@/lib/crypto')).decrypt(key) } catch { /* dev */ }
        const modelo = agente.modelo || apiCfg.openai_modelo_default || 'gpt-4o-mini'
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelo, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 5, temperature: 0 }),
        })
        if (r.ok) {
          const d = await r.json() as { choices?: [{ message?: { content?: string } }] }
          respuestaIA = d.choices?.[0]?.message?.content?.trim() ?? ''
        }
      } else if (agente.proveedor === 'anthropic' && apiCfg.anthropic_key_enc) {
        let key = apiCfg.anthropic_key_enc
        try { key = (await import('@/lib/crypto')).decrypt(key) } catch { /* dev */ }
        const modelo = agente.modelo || apiCfg.anthropic_modelo_default || 'claude-haiku-4-5-20251001'
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelo, max_tokens: 5, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] }),
        })
        if (r.ok) {
          const d = await r.json() as { content?: [{ text?: string }] }
          respuestaIA = d.content?.[0]?.text?.trim() ?? ''
        }
      }
      return /^s[íi]/i.test(respuestaIA) || /^yes/i.test(respuestaIA)
    }
    default:
      return false
  }
}

// ─── Valida el formato esperado de un dato capturado ─────────────────────────
function validarFormato(formato: 'texto' | 'email' | 'telefono' | 'numero' | 'fecha', valor: string): boolean {
  switch (formato) {
    case 'email':    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)
    case 'telefono': return /^\+?\d[\d\s-]{6,}$/.test(valor)
    case 'numero':   return /^\s*-?\d+([.,]\d+)?\s*$/.test(valor)
    case 'fecha':    return /^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/.test(valor) || /^\d{4}-\d{2}-\d{2}$/.test(valor)
    case 'texto':    return valor.trim().length > 0
    default:         return true
  }
}

// ─── Utilidades de grafo ──────────────────────────────────────────────────────
function getSiguienteNodo(edges: Edge[], nodoId: string): string | null {
  const edge = edges.find(e => e.source === nodoId && !e.sourceHandle)
    ?? edges.find(e => e.source === nodoId)
  return edge?.target ?? null
}

function getSiguienteNodoConSalida(edges: Edge[], nodoId: string, salida: string): string | null {
  const edge = edges.find(e => e.source === nodoId && e.sourceHandle === salida)
  return edge?.target ?? null
}

// ─── Enviar mensaje vía Meta API ──────────────────────────────────────────────
export async function enviarMensajeDirecto(
  supabase: Supa,
  tenantId: string,
  convId: string,
  texto: string,
  tipo: string
) {
  const { data: conv } = await supabase
    .from('conversaciones')
    .select('canal, canal_contact_id')
    .eq('id', convId)
    .maybeSingle()

  if (!conv || !texto.trim()) return

  const { data: cfg } = await supabase
    .from('config_meta')
    .select('wa_access_token_enc, wa_phone_number_id, messenger_access_token_enc, instagram_access_token_enc, instagram_account_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  let metaMessageId: string | null = null

  // Sin config_meta (o canal 'manual' del Chat de prueba) — no hay a quién mandarle
  // por Meta, pero el mensaje igual se registra en la conversación más abajo.
  if (cfg && conv.canal === 'whatsapp' && cfg.wa_access_token_enc && cfg.wa_phone_number_id) {
    let token = cfg.wa_access_token_enc
    try { token = decrypt(token) } catch { /* dev */ }

    const body = {
      messaging_product: 'whatsapp',
      to: conv.canal_contact_id,
      type: 'text',
      text: { body: texto, preview_url: false },
    }
    const r = await fetch(`https://graph.facebook.com/v20.0/${cfg.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) {
      const d = await r.json() as { messages?: [{ id: string }] }
      metaMessageId = d.messages?.[0]?.id ?? null
    }
  } else if (cfg && conv.canal === 'messenger' && cfg.messenger_access_token_enc) {
    let token = cfg.messenger_access_token_enc
    try { token = decrypt(token) } catch { /* dev */ }

    const body = {
      recipient: { id: conv.canal_contact_id },
      message: { text: texto },
    }
    const r = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) {
      const d = await r.json() as { message_id?: string }
      metaMessageId = d.message_id ?? null
    }
  }

  // Registrar en DB
  await supabase.from('mensajes').insert({
    conversacion_id: convId,
    tenant_id: tenantId,
    direccion: 'saliente',
    tipo,
    contenido: texto,
    meta_message_id: metaMessageId,
    enviado_por: null,
    estado_envio: metaMessageId ? 'enviado' : 'pendiente',
    leido_por_asesor: true,
  })

  await supabase.from('conversaciones').update({
    ultimo_mensaje_at: new Date().toISOString(),
    ultimo_mensaje_texto: texto.slice(0, 100),
    ultimo_mensaje_direccion: 'saliente',
  }).eq('id', convId)
}

// ─── Enviar plantilla WA aprobada ─────────────────────────────────────────────
async function enviarPlantillaWhatsApp(
  supabase: Supa,
  tenantId: string,
  convId: string,
  recipientPhone: string,
  templateName: string,
  languageCode: string,
  contexto: ContextoEjecucion,
  variablesOverride?: Record<string, string>
) {
  const { data: cfg } = await supabase
    .from('config_meta')
    .select('wa_access_token_enc, wa_phone_number_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!cfg?.wa_access_token_enc || !cfg.wa_phone_number_id) return

  let token = cfg.wa_access_token_enc
  try { token = decrypt(token) } catch { /* dev */ }

  const vars = { nombre: contexto.nombre_cliente ?? 'Cliente', ...variablesOverride }
  const components = Object.keys(vars).length > 0 ? [{
    type: 'body',
    parameters: Object.values(vars).map(v => ({ type: 'text', text: v })),
  }] : undefined

  const body = {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components ? { components } : {}),
    },
  }

  const r = await fetch(`https://graph.facebook.com/v20.0/${cfg.wa_phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (r.ok) {
    const d = await r.json() as { messages?: [{ id: string }] }
    await supabase.from('mensajes').insert({
      conversacion_id: convId,
      tenant_id: tenantId,
      direccion: 'saliente',
      tipo: 'texto',
      contenido: `[Plantilla: ${templateName}]`,
      meta_message_id: d.messages?.[0]?.id ?? null,
      enviado_por: null,
      estado_envio: 'enviado',
      leido_por_asesor: true,
    })
  }
}

// ─── Enviar media (imagen/doc/audio) vía WA ───────────────────────────────────
async function enviarMediaWhatsApp(
  supabase: Supa,
  tenantId: string,
  convId: string,
  recipientPhone: string,
  tipo: 'imagen' | 'documento' | 'audio' | 'video',
  mediaUrl: string,
  caption?: string
) {
  const { data: cfg } = await supabase
    .from('config_meta')
    .select('wa_access_token_enc, wa_phone_number_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!cfg?.wa_access_token_enc) return

  let token = cfg.wa_access_token_enc
  try { token = decrypt(token) } catch { /* dev */ }

  const tipoMeta = tipo === 'imagen' ? 'image' : tipo === 'documento' ? 'document' : tipo === 'audio' ? 'audio' : 'video'
  const body = {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: tipoMeta,
    [tipoMeta]: { link: mediaUrl, ...(caption ? { caption } : {}) },
  }

  const r = await fetch(`https://graph.facebook.com/v20.0/${cfg.wa_phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (r.ok) {
    const d = await r.json() as { messages?: [{ id: string }] }
    await supabase.from('mensajes').insert({
      conversacion_id: convId,
      tenant_id: tenantId,
      direccion: 'saliente',
      tipo,
      contenido: caption || `[${tipo}]`,
      meta_message_id: d.messages?.[0]?.id ?? null,
      enviado_por: null,
      estado_envio: 'enviado',
      leido_por_asesor: true,
    })
  }
}

// ─── Construir contexto inicial desde DB ──────────────────────────────────────
async function construirContexto(
  supabase: Supa,
  _tenantId: string,
  convId: string,
  clienteId: string | null
): Promise<ContextoEjecucion> {
  const contexto: ContextoEjecucion = {}

  // Datos del canal/conversación
  const { data: conv } = await supabase
    .from('conversaciones')
    .select('canal, canal_contact_id')
    .eq('id', convId)
    .maybeSingle()
  if (conv) contexto.canal = conv.canal

  // Último mensaje entrante
  const { data: ultimoMsg } = await supabase
    .from('mensajes')
    .select('contenido')
    .eq('conversacion_id', convId)
    .eq('direccion', 'entrante')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ultimoMsg?.contenido) contexto.ultimo_mensaje = ultimoMsg.contenido

  // Datos del cliente
  if (clienteId) {
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, celular, etapa_venta, assigned_to')
      .eq('id', clienteId)
      .maybeSingle()
    if (cliente) {
      contexto.nombre_cliente = cliente.nombre ?? undefined
      contexto.celular_cliente = cliente.celular ?? undefined
      contexto.etapa_actual = cliente.etapa_venta ?? undefined
      contexto.assigned_to = cliente.assigned_to ?? undefined
    }
  }

  return contexto
}

// ─── Interpolar variables en texto ───────────────────────────────────────────
function interpolarVariables(texto: string, contexto: ContextoEjecucion): string {
  return texto
    .replace(/\{\{nombre\}\}/gi, contexto.nombre_cliente ?? 'Cliente')
    .replace(/\{\{celular\}\}/gi, contexto.celular_cliente ?? '')
    .replace(/\{\{canal\}\}/gi, contexto.canal ?? '')
    .replace(/\{\{etapa\}\}/gi, contexto.etapa_actual ?? '')
    .replace(/\{\{ultimo_mensaje\}\}/gi, contexto.ultimo_mensaje ?? '')
    .replace(/\{\{resumen_conversacion\}\}/gi, contexto.resumen_conversacion ?? '')
    .replace(/\{\{variables\.(\w+)\}\}/gi, (_, k) => contexto.variables?.[k] ?? '')
    // Sintaxis corta para variables guardadas por nodos (Acción IA, Guardar respuesta):
    // {nombre variable} — admite espacios porque el usuario puede nombrar la
    // variable como quiera ("Respuesta IA"). Solo reemplaza si esa variable
    // existe, para no comerse llaves de otro texto que no sea una variable.
    .replace(/\{([^{}]+)\}/g, (match, k) => {
      const nombre = k.trim()
      return (contexto.variables && nombre in contexto.variables) ? contexto.variables[nombre] : match
    })
}

// ─── Registrar el paso de un nodo en el historial de la ejecución ─────────────
async function registrarPaso(
  supabase: Supa, ejecucionId: string, tenantId: string,
  nodoId: string, nodoTipo: string | null, resultado: ResultadoNodo,
) {
  const resultadoLog = resultado.tipo === 'continuar'
    ? (resultado.advertencia ? 'advertencia' : 'ok')
    : resultado.tipo
  const detalle = resultado.tipo === 'continuar' ? resultado.advertencia ?? null
    : resultado.tipo === 'error' ? resultado.error
    : null

  await supabase.from('flujo_ejecucion_pasos').insert({
    ejecucion_id: ejecucionId, tenant_id: tenantId,
    nodo_id: nodoId, nodo_tipo: nodoTipo,
    resultado: resultadoLog, detalle,
  })
}

// ─── Marcar ejecución como error ──────────────────────────────────────────────
async function marcarError(supabase: Supa, ejecucionId: string, error: string) {
  await supabase.from('flujo_ejecuciones').update({
    estado:       'error',
    ultimo_error: error,
    updated_at:   new Date().toISOString(),
  }).eq('id', ejecucionId)
}
