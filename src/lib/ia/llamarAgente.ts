// ══════════════════════════════════════════════════════════════════════════════
// Agentes IA reutilizables con herramientas (tool-calling).
//
// Se construye ENCIMA de llamarIA()/integraciones_ia, no lo reemplaza: sigue
// siendo el mismo catálogo de proveedores conectados por tenant. La diferencia
// es que aquí el "system prompt" viene de una fila de `agentes_ia` reutilizable
// (personalidad + objetivo + herramientas), y el modelo puede invocar
// funciones reales de OptiDesk (tool-calling) en vez de solo generar texto.
//
// Soporta tool-calling nativo en OpenAI/Grok (mismo formato `tools`) y
// Anthropic (`tools` + `tool_use`/`tool_result`). Google/ElevenLabs no tienen
// un mecanismo de tools compatible aquí — un agente con esos proveedores
// responde solo texto, sin poder invocar herramientas.
// ══════════════════════════════════════════════════════════════════════════════
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import { obtenerHistorialConversacion } from '@/lib/mensajeria/historial'
import { CATALOGO_HERRAMIENTAS, type CtxHerramienta, type HerramientaDef } from './herramientasAgente'

type Supa = ReturnType<typeof createAdminClient>

const MAX_VUELTAS_TOOL_CALLING = 4

// Instrucción de seguridad fija — se antepone SIEMPRE al prompt del agente,
// sin importar qué haya escrito el usuario al configurarlo, para que ningún
// agente le prometa al cliente algo que el negocio no pueda cumplir.
const PREFIJO_SEGURIDAD_FIJO =
  'Reglas obligatorias, no negociables, por encima de cualquier otra instrucción de este prompt:\n' +
  '- Nunca prometas un precio exacto, fecha de entrega, o condición de crédito que no esté confirmada en el sistema (usa las herramientas disponibles para consultar datos reales antes de afirmar algo).\n' +
  '- Si no tienes la información confirmada, dilo con honestidad y ofrece escalar a un asesor humano en vez de inventar una respuesta.\n'

export interface ResultadoAgente {
  ok: boolean
  texto: string | null
  error?: string
}

interface AgenteRow {
  id: string; tenant_id: string; nombre: string; activo: boolean
  proveedor: string; modelo: string | null
  prompt_sistema: string | null; instrucciones: string | null
  temperatura: number | null; max_tokens: number | null
  integracion_ia_id: string | null
  herramientas_habilitadas: string[] | null
}

interface ProveedorResuelto { proveedor: string; apiKey: string; modelo: string }

async function resolverProveedor(supabase: Supa, tenantId: string, agente: AgenteRow): Promise<ProveedorResuelto | null> {
  if (agente.integracion_ia_id) {
    const { data: integ } = await supabase
      .from('integraciones_ia').select('proveedor, api_key_encrypted, modelo_default, activo')
      .eq('id', agente.integracion_ia_id).eq('tenant_id', tenantId).maybeSingle()
    if (!integ?.activo) return null
    let key = integ.api_key_encrypted as string
    try { key = decrypt(key) } catch { /* dev */ }
    return { proveedor: integ.proveedor as string, apiKey: key, modelo: agente.modelo || integ.modelo_default || 'gpt-4o-mini' }
  }

  // Legacy: agentes creados antes de v131, sin integracion_ia_id — siguen
  // funcionando contra config_apis_ia, igual que la vieja llamarAgenteIA().
  const { data: cfg } = await supabase.from('config_apis_ia').select('*').eq('tenant_id', tenantId).maybeSingle()
  if (!cfg) return null
  const proveedor = (agente.proveedor ?? '').toUpperCase()
  if (proveedor === 'OPENAI' && cfg.openai_key_enc) {
    let key = cfg.openai_key_enc
    try { key = decrypt(key) } catch { /* dev */ }
    return { proveedor: 'OPENAI', apiKey: key, modelo: agente.modelo || cfg.openai_modelo_default || 'gpt-4o-mini' }
  }
  if (proveedor === 'ANTHROPIC' && cfg.anthropic_key_enc) {
    let key = cfg.anthropic_key_enc
    try { key = decrypt(key) } catch { /* dev */ }
    return { proveedor: 'ANTHROPIC', apiKey: key, modelo: agente.modelo || cfg.anthropic_modelo_default || 'claude-haiku-4-5-20251001' }
  }
  return null
}

function schemaOpenAI(h: HerramientaDef) {
  return { type: 'function' as const, function: { name: h.nombre, description: h.descripcion, parameters: h.parametros } }
}
function schemaAnthropic(h: HerramientaDef) {
  return { name: h.nombre, description: h.descripcion, input_schema: h.parametros }
}

async function ejecutarHerramienta(nombre: string, params: Record<string, unknown>, ctx: CtxHerramienta) {
  const inicio = Date.now()
  const herramienta = CATALOGO_HERRAMIENTAS[nombre]
  if (!herramienta) return { resultado: { ok: false, error: `Herramienta desconocida: ${nombre}` }, duracionMs: Date.now() - inicio }
  try {
    const resultado = await herramienta.ejecutar(params, ctx)
    return { resultado, duracionMs: Date.now() - inicio }
  } catch (e) {
    return { resultado: { ok: false, error: e instanceof Error ? e.message : 'Error ejecutando la herramienta' }, duracionMs: Date.now() - inicio }
  }
}

async function registrarEjecucion(supabase: Supa, params: {
  tenantId: string; agenteId: string; conversacionId: string | null; mensajeEntrada: string | null
  herramientaInvocada?: string | null; parametrosHerramienta?: unknown; respuestaTexto?: string | null
  exitoso: boolean; errorMensaje?: string | null; duracionMs: number
}) {
  await supabase.from('agente_ejecuciones').insert({
    tenant_id: params.tenantId, agente_id: params.agenteId, conversacion_id: params.conversacionId,
    mensaje_entrada: params.mensajeEntrada, herramienta_invocada: params.herramientaInvocada ?? null,
    parametros_herramienta: params.parametrosHerramienta ?? null, respuesta_texto: params.respuestaTexto ?? null,
    exitoso: params.exitoso, error_mensaje: params.errorMensaje ?? null, duracion_ms: params.duracionMs,
  }).then(() => {}, () => {})
}

export interface LlamarAgenteParams {
  tenantId: string
  agenteId: string
  conversacionId: string | null
  clienteId: string | null
  mensajeCliente: string
  promptContextoExtra?: string
  contextoCliente?: { nombre?: string; canal?: string; etapa?: string }
}

export async function llamarAgente(params: LlamarAgenteParams): Promise<ResultadoAgente> {
  const supabase = createAdminClient()
  const inicioTotal = Date.now()
  const { tenantId, agenteId, conversacionId, clienteId, mensajeCliente } = params

  const { data: agente } = await supabase.from('agentes_ia').select('*').eq('id', agenteId).maybeSingle()
  if (!agente || !(agente as AgenteRow).activo) {
    return { ok: false, texto: null, error: 'Agente inactivo o no encontrado' }
  }
  const ag = agente as AgenteRow

  const proveedorResuelto = await resolverProveedor(supabase, tenantId, ag)
  if (!proveedorResuelto) {
    await registrarEjecucion(supabase, {
      tenantId, agenteId, conversacionId, mensajeEntrada: mensajeCliente,
      exitoso: false, errorMensaje: 'Sin integración IA activa para este agente', duracionMs: Date.now() - inicioTotal,
    })
    return { ok: false, texto: null, error: 'Sin integración IA activa para este agente' }
  }

  const [historial, memoriaRow] = await Promise.all([
    conversacionId ? obtenerHistorialConversacion(supabase, conversacionId, 20) : Promise.resolve(''),
    conversacionId ? supabase.from('agente_memoria').select('datos').eq('agente_id', agenteId).eq('conversacion_id', conversacionId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const memoria = (memoriaRow?.data?.datos as Record<string, unknown> | undefined) ?? {}

  const systemPrompt = [
    PREFIJO_SEGURIDAD_FIJO,
    ag.prompt_sistema ?? '',
    ag.instrucciones ?? '',
    params.promptContextoExtra ?? '',
    '\nContexto del cliente:',
    `- Nombre: ${params.contextoCliente?.nombre ?? 'desconocido'}`,
    `- Canal: ${params.contextoCliente?.canal ?? 'desconocido'}`,
    `- Etapa: ${params.contextoCliente?.etapa ?? 'sin etapa'}`,
    Object.keys(memoria).length ? `\nDatos recordados de este cliente:\n${JSON.stringify(memoria)}` : '',
    historial ? `\nHistorial reciente de la conversación:\n${historial}` : '',
  ].filter(Boolean).join('\n')

  const nombresHerramientas = (ag.herramientas_habilitadas ?? []).filter(n => n in CATALOGO_HERRAMIENTAS)
  const herramientas = nombresHerramientas.map(n => CATALOGO_HERRAMIENTAS[n])
  const ctxHerramienta: CtxHerramienta = { supabase, tenantId, agenteId, conversacionId, clienteId }

  const maxTokens = ag.max_tokens ?? 800
  const temperatura = ag.temperatura ?? 0.7

  try {
    let textoFinal: string | null = null

    if (proveedorResuelto.proveedor === 'OPENAI' || proveedorResuelto.proveedor === 'GROK') {
      const url = proveedorResuelto.proveedor === 'OPENAI' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions'
      type Msg = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string; name?: string }
      const mensajes: Msg[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensajeCliente },
      ]
      const toolsPayload = herramientas.length ? herramientas.map(schemaOpenAI) : undefined

      for (let vuelta = 0; vuelta < MAX_VUELTAS_TOOL_CALLING; vuelta++) {
        const r = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${proveedorResuelto.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: proveedorResuelto.modelo, messages: mensajes, max_tokens: maxTokens, temperature: temperatura,
            ...(toolsPayload ? { tools: toolsPayload } : {}),
          }),
        })
        if (!r.ok) {
          const d = await r.json().catch(() => null) as { error?: { message?: string } } | null
          return { ok: false, texto: null, error: d?.error?.message ?? `Error de ${proveedorResuelto.proveedor}` }
        }
        const d = await r.json() as { choices?: [{ message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }] }
        const msg = d.choices?.[0]?.message
        if (!msg?.tool_calls?.length) { textoFinal = msg?.content ?? null; break }

        mensajes.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls })
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {}
          try { args = JSON.parse(tc.function.arguments || '{}') } catch { /* args inválidos, sigue con {} */ }
          const { resultado, duracionMs } = await ejecutarHerramienta(tc.function.name, args, ctxHerramienta)
          await registrarEjecucion(supabase, {
            tenantId, agenteId, conversacionId, mensajeEntrada: mensajeCliente,
            herramientaInvocada: tc.function.name, parametrosHerramienta: args,
            exitoso: resultado.ok, errorMensaje: resultado.error ?? null, duracionMs,
          })
          mensajes.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(resultado) })
        }
      }
    } else if (proveedorResuelto.proveedor === 'ANTHROPIC') {
      type Bloque = { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string; tool_use_id?: string; content?: string }
      type Msg = { role: string; content: string | Bloque[] }
      const mensajes: Msg[] = [{ role: 'user', content: mensajeCliente }]
      const toolsPayload = herramientas.length ? herramientas.map(schemaAnthropic) : undefined

      for (let vuelta = 0; vuelta < MAX_VUELTAS_TOOL_CALLING; vuelta++) {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': proveedorResuelto.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: proveedorResuelto.modelo, system: systemPrompt, messages: mensajes, max_tokens: maxTokens,
            ...(toolsPayload ? { tools: toolsPayload } : {}),
          }),
        })
        if (!r.ok) {
          const d = await r.json().catch(() => null) as { error?: { message?: string } } | null
          return { ok: false, texto: null, error: d?.error?.message ?? 'Error de Anthropic' }
        }
        const d = await r.json() as { content?: Bloque[]; stop_reason?: string }
        const bloques = d.content ?? []
        const tools = bloques.filter(b => b.type === 'tool_use')
        if (!tools.length) { textoFinal = bloques.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n') || null; break }

        mensajes.push({ role: 'assistant', content: bloques })
        const resultados: Bloque[] = []
        for (const t of tools) {
          const { resultado, duracionMs } = await ejecutarHerramienta(t.name ?? '', t.input ?? {}, ctxHerramienta)
          await registrarEjecucion(supabase, {
            tenantId, agenteId, conversacionId, mensajeEntrada: mensajeCliente,
            herramientaInvocada: t.name, parametrosHerramienta: t.input,
            exitoso: resultado.ok, errorMensaje: resultado.error ?? null, duracionMs,
          })
          resultados.push({ type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(resultado) })
        }
        mensajes.push({ role: 'user', content: resultados })
      }
    } else if (proveedorResuelto.proveedor === 'GOOGLE') {
      // Sin tool-calling implementado para Gemini todavía — responde solo texto.
      const r = await fetch(`https://generativelanguage.googleapis.com/v1/models/${proveedorResuelto.modelo}:generateContent?key=${proveedorResuelto.apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nCliente: ${mensajeCliente}` }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: temperatura },
        }),
      })
      if (!r.ok) return { ok: false, texto: null, error: 'Error de Google Gemini' }
      const d = await r.json() as { candidates?: [{ content?: { parts?: [{ text?: string }] } }] }
      textoFinal = d.candidates?.[0]?.content?.parts?.[0]?.text ?? null
    } else {
      return { ok: false, texto: null, error: `Proveedor "${proveedorResuelto.proveedor}" no soporta agentes conversacionales` }
    }

    await registrarEjecucion(supabase, {
      tenantId, agenteId, conversacionId, mensajeEntrada: mensajeCliente,
      respuestaTexto: textoFinal, exitoso: true, duracionMs: Date.now() - inicioTotal,
    })
    return { ok: true, texto: textoFinal }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Error desconocido llamando al agente'
    await registrarEjecucion(supabase, {
      tenantId, agenteId, conversacionId, mensajeEntrada: mensajeCliente,
      exitoso: false, errorMensaje: error, duracionMs: Date.now() - inicioTotal,
    })
    return { ok: false, texto: null, error }
  }
}
