// ══════════════════════════════════════════════════════════════════════════════
// Flow Executor — Motor de ejecución de flujos de automatización
// Procesa nodos de un flujo cuando llega un mensaje o un trigger programado.
// Corre en el contexto de API routes (Node.js, server-side).
// ══════════════════════════════════════════════════════════════════════════════

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import type { Node, Edge } from 'reactflow'
import type { ContextoEjecucion, TriggerTipo } from '@/types/flujos'

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

  const nodos = flujo.nodos as { nodes: Node[]; edges: Edge[] } | null
  if (!nodos?.nodes?.length) {
    console.log(`[flow-executor] ✗ flujo sin nodos`)
    return
  }

  // Encontrar el nodo trigger
  const nodosOrdenados = nodos.nodes
  const nodoTrigger = nodosOrdenados.find(n => n.type === 'trigger')
  if (!nodoTrigger) {
    console.log(`[flow-executor] ✗ no hay nodo tipo 'trigger' en el flujo`)
    return
  }
  console.log(`[flow-executor] nodoTrigger=${nodoTrigger.id} → insertando ejecución...`)

  // Obtener contexto del cliente
  const contexto = await construirContexto(supabase, tenantId, conversacionId, clienteId)

  // Crear ejecución
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

  // Marcar cliente como automatizado
  if (clienteId) {
    await supabase.from('clientes')
      .update({ automatizado: true, flujo_activo_id: flujo.id })
      .eq('id', clienteId)
  }

  // Procesar desde el nodo trigger (avanza al primer nodo real)
  await continuarEjecucion(supabase, ejecucion.id)
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

      // Limpiar automatizado del cliente
      if (ejec.cliente_id) {
        await supabase.from('clientes')
          .update({ automatizado: false, flujo_activo_id: null })
          .eq('id', ejec.cliente_id)
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
  | { tipo: 'continuar'; siguiente_nodo_id: string | null; contexto?: Partial<ContextoEjecucion> }
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

    // ── Asignar asesor ────────────────────────────────────────────────────────
    case 'asignar': {
      if (!convId) return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }

      if (data.tipo_asignacion === 'usuario_fijo' && data.asignar_a) {
        await supabase.from('conversaciones')
          .update({ assigned_to: String(data.asignar_a) })
          .eq('id', convId)
        if (clienteId) {
          await supabase.from('clientes')
            .update({ assigned_to: String(data.asignar_a) })
            .eq('id', clienteId)
        }
      } else {
        // Round robin: asesor con menos conversaciones abiertas
        const { data: asesores } = await supabase
          .from('usuarios').select('id').eq('tenant_id', tenantId).in('rol', ['admin', 'gerencia', 'asesor'])
        if (asesores?.length) {
          let menorCarga = Infinity; let seleccionado = asesores[0].id
          for (const a of asesores) {
            const { count } = await supabase.from('conversaciones')
              .select('id', { count: 'exact', head: true })
              .eq('assigned_to', a.id).eq('estado', 'abierta')
            if ((count ?? 0) < menorCarga) { menorCarga = count ?? 0; seleccionado = a.id }
          }
          await supabase.from('conversaciones').update({ assigned_to: seleccionado }).eq('id', convId)
          if (clienteId) {
            await supabase.from('clientes').update({ assigned_to: seleccionado }).eq('id', clienteId)
          }
        }
      }
      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
    }

    // ── Esperar (delay o hasta respuesta) ────────────────────────────────────
    case 'esperar': {
      const siguienteId = getSiguienteNodo(edges, nodo.id)

      // Si el siguiente nodo es menu_opciones, pre-marcar _menu_esperando para que
      // la respuesta del cliente sea evaluada directamente sin una fase extra de pausa
      const siguienteNodo = nodes.find(n => n.id === siguienteId)
      const ctxExtra = siguienteNodo?.type === 'menu_opciones' ? { _menu_esperando: siguienteId } : {}

      if (String(data.modo_espera ?? 'tiempo') === 'respuesta') {
        const lejano = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000).toISOString()
        return { tipo: 'pausar', proxima_ejecucion_at: lejano, siguiente_nodo_id: siguienteId, contexto: ctxExtra }
      }

      const horas = Number(data.horas ?? 24)
      const minutos = Number(data.minutos ?? 0)
      const totalMs = (horas * 3600 + minutos * 60) * 1000
      const proxima = new Date(Date.now() + totalMs).toISOString()
      return { tipo: 'pausar', proxima_ejecucion_at: proxima, siguiente_nodo_id: siguienteId, contexto: ctxExtra }
    }

    // ── Cambiar etapa de venta ────────────────────────────────────────────────
    case 'etapa': {
      const etapa = String(data.etapa ?? '')
      if (etapa && clienteId) {
        // Importar pipeline solo cuando se necesita
        const { ETAPA_MAP, ETAPAS } = await import('@/lib/ventas/pipeline')
        const etapaInfo = ETAPA_MAP[etapa as keyof typeof ETAPA_MAP]
        if (etapaInfo) {
          const orden = ETAPAS.findIndex(e => e.id === etapa)
          await supabase.from('clientes')
            .update({
              etapa_venta: etapa,
              etapa_venta_orden: orden >= 0 ? orden : 0,
              en_seguimiento_ventas: true,
            })
            .eq('id', clienteId)

          // Registrar en historial (no crítico, ignorar errores)
          try {
            await supabase.from('historial_etapas_cliente').insert({
              cliente_id: clienteId,
              tenant_id: tenantId,
              etapa_nueva: etapa,
              origen: 'automatizacion',
            })
          } catch { /* non-critical */ }
        }
      }
      return {
        tipo: 'continuar',
        siguiente_nodo_id: getSiguienteNodo(edges, nodo.id),
        contexto: { etapa_actual: etapa },
      }
    }

    // ── Condición (bifurcación) ───────────────────────────────────────────────
    case 'condicion': {
      const condicionTipo  = String(data.condicion_tipo  ?? '')
      const condicionValor = String(data.condicion_valor ?? '').trim()
      const ultimoMsg      = (contexto.ultimo_mensaje ?? '').trim()
      const ultimoMsgLower = ultimoMsg.toLowerCase()
      let resultado = false

      console.log(`[condicion] tipo="${condicionTipo}" valor="${condicionValor}" ultimoMsg="${ultimoMsg}" ultimoMsgLower="${ultimoMsgLower}"`)

      switch (condicionTipo) {

        // ── Canal ────────────────────────────────────────────────────────────
        case 'canal': {
          const { data: conv } = await supabase
            .from('conversaciones').select('canal').eq('id', convId ?? '').maybeSingle()
          resultado = conv?.canal === condicionValor
          break
        }

        // ── Etapa ────────────────────────────────────────────────────────────
        case 'etapa':
          resultado = (contexto.etapa_actual ?? '') === condicionValor
          break

        // ── Tiene celular ────────────────────────────────────────────────────
        case 'tiene_celular': {
          if (clienteId) {
            const { data: cl } = await supabase
              .from('clientes').select('celular').eq('id', clienteId).maybeSingle()
            resultado = !!(cl?.celular?.trim())
          }
          break
        }

        // ── Es nuevo ─────────────────────────────────────────────────────────
        case 'es_nuevo':
          resultado = contexto.etapa_actual === 'nuevo_mensaje' || contexto.etapa_actual === 'nuevo'
          break

        // ── Contiene alguna palabra (subcadena, sin dividir) ─────────────────
        case 'respuesta_contiene':
          resultado = ultimoMsgLower.includes(condicionValor.toLowerCase())
          break

        // ── Contiene ALGUNA de varias palabras clave (comparación por palabra completa)
        case 'palabras_clave': {
          const palabras  = condicionValor.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
          const msgTokens = ultimoMsgLower.split(/[\s,;.!?¿¡\-_/\\|()[\]{}]+/).filter(Boolean)
          resultado = palabras.some(p => msgTokens.includes(p))
          break
        }

        // ── Contiene TODAS las palabras clave (comparación por palabra completa)
        case 'contiene_todas': {
          const palabras  = condicionValor.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
          const msgTokens = ultimoMsgLower.split(/[\s,;.!?¿¡\-_/\\|()[\]{}]+/).filter(Boolean)
          resultado = palabras.length > 0 && palabras.every(p => msgTokens.includes(p))
          break
        }

        // ── Es exactamente este texto ─────────────────────────────────────────
        case 'es_exactamente':
          resultado = ultimoMsgLower === condicionValor.toLowerCase()
          break

        // ── Empieza con ──────────────────────────────────────────────────────
        case 'empieza_con':
          resultado = ultimoMsgLower.startsWith(condicionValor.toLowerCase())
          break

        // ── Termina con ──────────────────────────────────────────────────────
        case 'termina_con':
          resultado = ultimoMsgLower.endsWith(condicionValor.toLowerCase())
          break

        // ── Longitud mayor a N caracteres ────────────────────────────────────
        case 'longitud_mayor': {
          const n = parseInt(condicionValor) || 10
          resultado = ultimoMsg.length > n
          break
        }

        // ── Respuesta positiva ───────────────────────────────────────────────
        case 'es_positivo': {
          const positivos = ['sí','si','claro','dale','ok','bueno','bien','correcto','exacto',
            'afirmativo','listo','perfecto','va','sip','seee','yep','yes','obvio']
          const msgTokens = ultimoMsgLower.split(/[\s,;.!?¿¡\-_/\\|()[\]{}]+/).filter(Boolean)
          resultado = positivos.some(p => msgTokens.includes(p))
          break
        }

        // ── Respuesta negativa ───────────────────────────────────────────────
        case 'es_negativo': {
          const negativos = ['no','nop','nope','tampoco','negativo','nel','nada','negado']
          const msgTokens = ultimoMsgLower.split(/[\s,;.!?¿¡\-_/\\|()[\]{}]+/).filter(Boolean)
          resultado = negativos.some(p => msgTokens.includes(p))
          break
        }

        // ── Respuesta es un número ───────────────────────────────────────────
        case 'es_numero':
          resultado = /^\s*\d+([.,]\d+)?\s*$/.test(ultimoMsg)
          break

        // ── Horario laboral (lun-sáb 7am–6pm Colombia UTC-5) ─────────────────
        case 'horario_laboral': {
          const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }))
          const dia  = ahora.getDay()  // 0=dom, 6=sáb
          const hora = ahora.getHours()
          resultado = dia >= 1 && dia <= 6 && hora >= 7 && hora < 18
          break
        }

        // ── IA evalúa la condición ───────────────────────────────────────────
        case 'ia_evalua': {
          const agenteId      = String(data.agente_id ?? '')
          const pregunta      = String(data.condicion_pregunta ?? '').trim()
          if (!agenteId || !pregunta || !ultimoMsg) { resultado = false; break }

          // Cargar agente y claves API
          const [{ data: agente }, { data: apiCfg }] = await Promise.all([
            supabase.from('agentes_ia').select('proveedor,modelo').eq('id', agenteId).maybeSingle(),
            supabase.from('config_apis_ia').select('openai_key_enc,anthropic_key_enc,openai_modelo_default,anthropic_modelo_default').eq('tenant_id', tenantId).maybeSingle(),
          ])

          if (!agente || !apiCfg) { resultado = false; break }

          const systemPrompt = 'Eres un evaluador. Lee el mensaje del cliente y responde SOLO con "SÍ" o "NO". Sin explicaciones, sin puntuación extra, solo SÍ o NO.'
          const userPrompt   = `Mensaje del cliente: "${ultimoMsg}"\n\nPregunta: ${pregunta}\n\nResponde SÍ o NO:`

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

          resultado = /^s[íi]/i.test(respuestaIA) || /^yes/i.test(respuestaIA)
          console.log(`[condicion/ia_evalua] pregunta="${pregunta}" respuestaIA="${respuestaIA}" resultado=${resultado}`)
          break
        }

        default:
          resultado = false
      }

      const salida = resultado ? 'true' : 'false'
      const siguiente = getSiguienteNodoConSalida(edges, nodo.id, salida)
      const edgesDeNodo = edges.filter(e => e.source === nodo.id).map(e => `${e.sourceHandle}→${e.target}`)
      console.log(`[condicion] resultado=${resultado} salida="${salida}" siguiente=${siguiente} edges=[${edgesDeNodo.join(', ')}]`)
      return { tipo: 'continuar', siguiente_nodo_id: siguiente }
    }

    // ── Agente IA ─────────────────────────────────────────────────────────────
    case 'agente_ia': {
      const agenteId = String(data.agente_id ?? '')
      const promptContexto = String(data.prompt_contexto ?? '')

      if (!agenteId || !convId) {
        return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
      }

      try {
        const respuesta = await llamarAgenteIA(supabase, tenantId, agenteId, contexto, promptContexto)
        if (respuesta) {
          await enviarMensajeDirecto(supabase, tenantId, convId, respuesta, 'texto')
        }
        return {
          tipo: 'continuar',
          siguiente_nodo_id: getSiguienteNodo(edges, nodo.id),
          contexto: { respuestas: { ...contexto.respuestas, [agenteId]: respuesta ?? '' } },
        }
      } catch (e) {
        console.error('[flow-executor] Error agente IA:', e)
        return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
      }
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
        console.error('[flow-executor] Error plantilla:', e)
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
          console.error('[flow-executor] Error media:', e)
        }
      }
      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
    }

    // ── Nota interna ──────────────────────────────────────────────────────────
    case 'nota_interna': {
      const contenido = String(data.contenido ?? '')
      if (contenido.trim() && convId) {
        await supabase.from('mensajes').insert({
          conversacion_id: convId,
          tenant_id: tenantId,
          direccion: 'saliente',
          tipo: 'nota_interna',
          contenido: interpolarVariables(contenido, contexto),
          enviado_por: null,
          estado_envio: 'enviado',
          leido_por_asesor: false,
        })
      }
      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
    }

    // ── Etiquetar cliente ────────────────────────────────────────────────────
    case 'etiqueta': {
      const accionEtiqueta = String(data.accion ?? 'agregar')
      let etiquetaId = String(data.etiqueta_id ?? '').trim()
      const nuevaNombre = String(data.nueva_etiqueta_nombre ?? '').trim()
      const nuevaColor  = String(data.nueva_etiqueta_color  ?? '#3b82f6')

      // Modo "crear nueva": buscar o crear la etiqueta por nombre
      if (!etiquetaId && nuevaNombre && clienteId) {
        const { data: existente } = await supabase
          .from('etiquetas')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('nombre', nuevaNombre)
          .maybeSingle()

        if (existente) {
          etiquetaId = existente.id
        } else {
          const { data: creada } = await supabase
            .from('etiquetas')
            .insert({ tenant_id: tenantId, nombre: nuevaNombre, color: nuevaColor })
            .select('id')
            .single()
          if (creada) etiquetaId = creada.id
        }
      }

      if (etiquetaId && clienteId) {
        if (accionEtiqueta === 'agregar') {
          await supabase.from('clientes_etiquetas').upsert(
            { cliente_id: clienteId, etiqueta_id: etiquetaId, tenant_id: tenantId },
            { onConflict: 'cliente_id,etiqueta_id' }
          )
        } else {
          await supabase.from('clientes_etiquetas')
            .delete()
            .eq('cliente_id', clienteId)
            .eq('etiqueta_id', etiquetaId)
        }
      }
      return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id) }
    }

    // ── Subflujo (ejecutar otro flujo anidado) ────────────────────────────────
    case 'subflujo': {
      const subflujoId = String(data.subflujo_id ?? '').trim()
      if (subflujoId && convId) {
        iniciarFlujoParaConversacion(tenantId, convId, ejec.cliente_id as string | null, 'mensaje_nuevo', subflujoId)
          .catch(e => console.error('[flow-executor] Error subflujo:', e))
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

    // ── Guardar respuesta del cliente en campo del perfil ─────────────────────
    case 'capturar_dato': {
      const campo = String(data.campo ?? 'nombre')
      const nombreVar = campo === 'variable' ? String(data.nombre_variable ?? 'dato') : campo
      const valor = (contexto.ultimo_mensaje ?? '').trim()

      if (valor) {
        const nuevasVars = { ...(contexto.variables ?? {}), [nombreVar]: valor }

        const camposDB: Record<string, string> = {
          nombre: 'nombre', celular: 'celular', email: 'email', cedula: 'cedula',
        }

        if (clienteId && camposDB[campo]) {
          await supabase.from('clientes')
            .update({ [camposDB[campo]]: valor })
            .eq('id', clienteId)

          // Sincronizar contexto si es nombre o celular (se usan en interpolación)
          const ctxUpdate: Partial<ContextoEjecucion> = { variables: nuevasVars }
          if (campo === 'nombre') ctxUpdate.nombre_cliente = valor
          if (campo === 'celular') ctxUpdate.celular_cliente = valor

          console.log(`[flow-executor] capturar_dato: campo=${campo} valor="${valor}" cliente=${clienteId}`)
          return { tipo: 'continuar', siguiente_nodo_id: getSiguienteNodo(edges, nodo.id), contexto: ctxUpdate }
        }

        return {
          tipo: 'continuar',
          siguiente_nodo_id: getSiguienteNodo(edges, nodo.id),
          contexto: { variables: nuevasVars },
        }
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
async function enviarMensajeDirecto(
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

  if (!cfg) return

  let metaMessageId: string | null = null

  if (conv.canal === 'whatsapp' && cfg.wa_access_token_enc && cfg.wa_phone_number_id) {
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
  } else if (conv.canal === 'messenger' && cfg.messenger_access_token_enc) {
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

// ─── Llamar agente IA (OpenAI / Anthropic) ────────────────────────────────────
async function llamarAgenteIA(
  supabase: Supa,
  tenantId: string,
  agenteId: string,
  contexto: ContextoEjecucion,
  promptContexto: string
): Promise<string | null> {
  const { data: agente } = await supabase
    .from('agentes_ia')
    .select('*')
    .eq('id', agenteId)
    .maybeSingle()

  if (!agente || !agente.activo) return null

  const { data: configApis } = await supabase
    .from('config_apis_ia')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!configApis) return null

  const systemPrompt = [
    agente.prompt_sistema ?? '',
    agente.instrucciones ?? '',
    promptContexto,
    '\nContexto del cliente:',
    `- Nombre: ${contexto.nombre_cliente ?? 'desconocido'}`,
    `- Canal: ${contexto.canal ?? 'desconocido'}`,
    `- Etapa: ${contexto.etapa_actual ?? 'sin etapa'}`,
    contexto.ultimo_mensaje ? `- Último mensaje del cliente: "${contexto.ultimo_mensaje}"` : '',
  ].filter(Boolean).join('\n')

  const userMessage = contexto.ultimo_mensaje ?? 'Inicia la conversación con el cliente.'

  if (agente.proveedor === 'openai' && configApis.openai_key_enc) {
    let key = configApis.openai_key_enc
    try { key = decrypt(key) } catch { /* dev */ }

    const modelo = agente.modelo ?? configApis.openai_modelo_default ?? 'gpt-4o-mini'
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: agente.max_tokens ?? 800,
        temperature: agente.temperatura ?? 0.7,
      }),
    })
    if (r.ok) {
      const d = await r.json() as { choices?: [{ message?: { content?: string } }] }
      return d.choices?.[0]?.message?.content ?? null
    }
  }

  if (agente.proveedor === 'anthropic' && configApis.anthropic_key_enc) {
    let key = configApis.anthropic_key_enc
    try { key = decrypt(key) } catch { /* dev */ }

    const modelo = agente.modelo ?? configApis.anthropic_modelo_default ?? 'claude-haiku-4-5-20251001'
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelo,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: agente.max_tokens ?? 800,
      }),
    })
    if (r.ok) {
      const d = await r.json() as { content?: [{ type: string; text?: string }] }
      return d.content?.[0]?.text ?? null
    }
  }

  return null
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
    .replace(/\{\{variables\.(\w+)\}\}/gi, (_, k) => contexto.variables?.[k] ?? '')
}

// ─── Marcar ejecución como error ──────────────────────────────────────────────
async function marcarError(supabase: Supa, ejecucionId: string, error: string) {
  await supabase.from('flujo_ejecuciones').update({
    estado:       'error',
    ultimo_error: error,
    updated_at:   new Date().toISOString(),
  }).eq('id', ejecucionId)
}
