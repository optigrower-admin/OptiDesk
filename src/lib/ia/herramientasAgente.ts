// ══════════════════════════════════════════════════════════════════════════════
// Catálogo de herramientas invocables por un Agente IA (tool-calling).
// Cada herramienta es una función real conectada a lo que ya existe en
// OptiDesk — no duplica lógica de negocio, reutiliza tablas/patrones ya en
// producción (Seguimiento Actividades, Pipeline, Plantillas, Bandeja, etc.).
// ══════════════════════════════════════════════════════════════════════════════
import { createAdminClient } from '@/lib/supabase/admin'
import { dispararWebhook } from '@/lib/webhooks/disparar'

type Supa = ReturnType<typeof createAdminClient>

export interface CtxHerramienta {
  supabase: Supa
  tenantId: string
  agenteId: string
  conversacionId: string | null
  clienteId: string | null
}

export interface ResultadoHerramienta {
  ok: boolean
  resultado?: unknown
  error?: string
}

// JSON Schema estándar (mismo formato base para OpenAI `function.parameters`
// y Anthropic `input_schema` — se adapta al formato exacto de cada proveedor
// en llamarAgente.ts).
export interface HerramientaDef {
  nombre: string
  descripcion: string
  parametros: {
    type: 'object'
    properties: Record<string, { type: string; description?: string; enum?: string[] }>
    required?: string[]
  }
  ejecutar: (params: Record<string, unknown>, ctx: CtxHerramienta) => Promise<ResultadoHerramienta>
}

async function requiereCliente(ctx: CtxHerramienta, clienteIdParam?: unknown): Promise<string | null> {
  const id = (clienteIdParam as string | undefined) ?? ctx.clienteId ?? undefined
  if (!id) return null
  const { data } = await ctx.supabase.from('clientes').select('id').eq('id', id).eq('tenant_id', ctx.tenantId).maybeSingle()
  return data?.id ?? null
}

// ─── agendar_seguimiento ──────────────────────────────────────────────────────
const agendarSeguimiento: HerramientaDef = {
  nombre: 'agendar_seguimiento',
  descripcion: 'Crea un recordatorio de seguimiento para el cliente en el módulo de Seguimiento Actividades, para que un asesor lo contacte en la fecha indicada.',
  parametros: {
    type: 'object',
    properties: {
      cliente_id: { type: 'string', description: 'ID del cliente (opcional si ya está en el contexto de la conversación)' },
      fecha: { type: 'string', description: 'Fecha y hora del seguimiento en formato ISO 8601 (ej. 2026-08-15T10:00:00)' },
      nota: { type: 'string', description: 'Nota breve de qué se debe hacer/recordar en ese seguimiento' },
    },
    required: ['fecha', 'nota'],
  },
  async ejecutar(params, ctx) {
    const clienteId = await requiereCliente(ctx, params.cliente_id)
    if (!clienteId) return { ok: false, error: 'Cliente no encontrado' }
    const fecha = String(params.fecha ?? '')
    if (!fecha || isNaN(Date.parse(fecha))) return { ok: false, error: 'Fecha inválida' }

    const { data: cliente } = await ctx.supabase.from('clientes').select('assigned_to').eq('id', clienteId).maybeSingle()

    const { error } = await ctx.supabase.from('recordatorios').insert({
      tenant_id: ctx.tenantId,
      cliente_id: clienteId,
      conversacion_id: ctx.conversacionId,
      asignado_a: cliente?.assigned_to ?? null,
      nota: String(params.nota ?? '').slice(0, 500),
      fecha_recordatorio: new Date(fecha).toISOString(),
      tipo: 'seguimiento_auto',
    })
    if (error) return { ok: false, error: error.message }

    await ctx.supabase.from('clientes').update({
      proxima_accion: String(params.nota ?? '').slice(0, 200),
      proxima_accion_fecha: new Date(fecha).toISOString(),
    }).eq('id', clienteId).eq('tenant_id', ctx.tenantId)

    return { ok: true, resultado: { agendado: true, fecha } }
  },
}

// ─── solicitar_fotos_producto ─────────────────────────────────────────────────
const solicitarFotosProducto: HerramientaDef = {
  nombre: 'solicitar_fotos_producto',
  descripcion: 'Pide fotos de un producto/modelo al cliente. Si hay una plantilla de WhatsApp aprobada para esto la envía; si no, deja una nota interna para que el asesor humano se las pida.',
  parametros: {
    type: 'object',
    properties: {
      cliente_id: { type: 'string', description: 'ID del cliente (opcional si ya está en el contexto)' },
      categoria_o_modelo: { type: 'string', description: 'Categoría o modelo de producto del que se piden fotos' },
    },
    required: ['categoria_o_modelo'],
  },
  async ejecutar(params, ctx) {
    const clienteId = await requiereCliente(ctx, params.cliente_id)
    if (!clienteId) return { ok: false, error: 'Cliente no encontrado' }
    const modelo = String(params.categoria_o_modelo ?? '').slice(0, 200)

    if (ctx.conversacionId) {
      await ctx.supabase.from('mensajes').insert({
        conversacion_id: ctx.conversacionId, tenant_id: ctx.tenantId, direccion: 'saliente',
        tipo: 'nota_interna', contenido: `🤖 El agente detectó interés en fotos de "${modelo}" — pídeselas al cliente si el bot no pudo enviarlas automáticamente.`,
        enviado_por: null, estado_envio: 'enviado', leido_por_asesor: false,
      })
    }
    return { ok: true, resultado: { nota_creada: true, modelo } }
  },
}

// ─── iniciar_estudio_credito ───────────────────────────────────────────────────
const iniciarEstudioCredito: HerramientaDef = {
  nombre: 'iniciar_estudio_credito',
  descripcion: 'Inicia el proceso de estudio de crédito para el cliente — dispara la integración externa si existe, o crea un recordatorio interno para que el equipo lo gestione.',
  parametros: {
    type: 'object',
    properties: {
      cliente_id: { type: 'string', description: 'ID del cliente (opcional si ya está en el contexto)' },
    },
  },
  async ejecutar(params, ctx) {
    const clienteId = await requiereCliente(ctx, params.cliente_id)
    if (!clienteId) return { ok: false, error: 'Cliente no encontrado' }

    await dispararWebhook(ctx.tenantId, 'ia.estudio_credito_solicitado', { cliente_id: clienteId, conversacion_id: ctx.conversacionId })

    const { data: cliente } = await ctx.supabase.from('clientes').select('assigned_to').eq('id', clienteId).maybeSingle()
    await ctx.supabase.from('recordatorios').insert({
      tenant_id: ctx.tenantId, cliente_id: clienteId, conversacion_id: ctx.conversacionId,
      asignado_a: cliente?.assigned_to ?? null,
      nota: 'El cliente solicitó iniciar estudio de crédito (vía agente IA).',
      fecha_recordatorio: new Date().toISOString(), tipo: 'manual',
    })
    return { ok: true, resultado: { solicitado: true } }
  },
}

// ─── consultar_inventario (solo lectura) ──────────────────────────────────────
const consultarInventario: HerramientaDef = {
  nombre: 'consultar_inventario',
  descripcion: 'Consulta si un modelo o categoría de moto está activo en el catálogo real de MotoSpace, y su precio CON papeles/matrícula incluidos (precio_con_papeles) — ese es el único precio que se le debe dar al cliente, nunca el precio sin papeles. Solo lectura — nunca inventes disponibilidad ni precio, usa esta herramienta. IMPORTANTE: el catálogo no tiene conteo de unidades, solo indica si el modelo está activo para la venta.',
  parametros: {
    type: 'object',
    properties: {
      modelo_o_categoria: { type: 'string', description: 'Texto a buscar en el nombre/referencia del modelo' },
    },
    required: ['modelo_o_categoria'],
  },
  async ejecutar(params, ctx) {
    const texto = String(params.modelo_o_categoria ?? '').trim()
    if (!texto) return { ok: false, error: 'Falta el modelo o categoría a buscar' }
    const { data, error } = await ctx.supabase
      .from('motos_catalogo')
      .select('referencia, precio, costo_documentos, cilindraje, activa')
      .eq('tenant_id', ctx.tenantId)
      .ilike('referencia', `%${texto}%`)
      .limit(5)
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: true, resultado: { encontrados: [], nota: 'Ningún modelo activo coincide con esa búsqueda en el catálogo.' } }
    return {
      ok: true,
      resultado: {
        encontrados: data.map(m => ({
          referencia: m.referencia,
          precio_con_papeles: m.precio + (m.costo_documentos ?? 0),
          cilindraje: m.cilindraje,
          activo: m.activa,
        })),
        nota: 'precio_con_papeles ya incluye matrícula/documentos — es el único precio que se le debe dar al cliente. No hay conteo de unidades disponibles en el sistema — solo confirma si el modelo está activo para la venta.',
      },
    }
  },
}

// ─── mover_pipeline ────────────────────────────────────────────────────────────
const moverPipeline: HerramientaDef = {
  nombre: 'mover_pipeline',
  descripcion: 'Mueve al cliente a otra etapa del pipeline de ventas (ej. cuando confirma que va a comprar, o cuando pierde interés).',
  parametros: {
    type: 'object',
    properties: {
      cliente_id: { type: 'string', description: 'ID del cliente (opcional si ya está en el contexto)' },
      nueva_etapa: { type: 'string', description: 'Clave de la nueva etapa (ej. "ganado", "en_matricula")' },
    },
    required: ['nueva_etapa'],
  },
  async ejecutar(params, ctx) {
    const clienteId = await requiereCliente(ctx, params.cliente_id)
    if (!clienteId) return { ok: false, error: 'Cliente no encontrado' }
    const nuevaEtapa = String(params.nueva_etapa ?? '').trim()

    const { data: etapaRow } = await ctx.supabase
      .from('etapas_pipeline').select('id, orden').eq('tenant_id', ctx.tenantId).eq('clave', nuevaEtapa).maybeSingle()
    if (!etapaRow) return { ok: false, error: `La etapa "${nuevaEtapa}" no existe en este pipeline` }

    const { error } = await ctx.supabase.from('clientes')
      .update({ etapa_venta: nuevaEtapa, etapa_venta_orden: etapaRow.orden })
      .eq('id', clienteId).eq('tenant_id', ctx.tenantId)
    if (error) return { ok: false, error: error.message }

    if (ctx.conversacionId) {
      const { dispararAutomatizacionesEtapa } = await import('@/lib/mensajeria/flow-executor')
      dispararAutomatizacionesEtapa(ctx.tenantId, ctx.conversacionId, clienteId, nuevaEtapa).catch(() => {})
    }
    return { ok: true, resultado: { etapa: nuevaEtapa } }
  },
}

// ─── escalar_a_humano ──────────────────────────────────────────────────────────
const escalarAHumano: HerramientaDef = {
  nombre: 'escalar_a_humano',
  descripcion: 'Transfiere la conversación a un asesor humano — úsala cuando el cliente pida hablar con una persona, se moleste, o la situación esté fuera de lo que el agente puede resolver.',
  parametros: {
    type: 'object',
    properties: {
      cliente_id: { type: 'string', description: 'ID del cliente (opcional si ya está en el contexto)' },
      motivo: { type: 'string', description: 'Motivo breve de la escalación' },
    },
    required: ['motivo'],
  },
  async ejecutar(params, ctx) {
    if (!ctx.conversacionId) return { ok: false, error: 'Sin conversación activa para escalar' }
    const clienteId = await requiereCliente(ctx, params.cliente_id)
    const motivo = String(params.motivo ?? 'Solicitado por el cliente').slice(0, 300)

    const { data: asesores } = await ctx.supabase
      .from('usuarios').select('id').eq('tenant_id', ctx.tenantId).in('rol', ['admin', 'gerencia', 'asesor']).eq('activo', true)
    let seleccionado: string | null = null
    if (asesores?.length) {
      let menorCarga = Infinity
      for (const a of asesores) {
        const { count } = await ctx.supabase.from('conversaciones').select('id', { count: 'exact', head: true }).eq('assigned_to', a.id).eq('estado', 'abierta')
        if ((count ?? 0) < menorCarga) { menorCarga = count ?? 0; seleccionado = a.id }
      }
    }

    await ctx.supabase.from('conversaciones').update({
      estado: 'pendiente', ...(seleccionado ? { assigned_to: seleccionado } : {}),
    }).eq('id', ctx.conversacionId)
    if (clienteId) {
      // bot_bloqueado=true impide que se arranque una ejecución nueva del
      // flujo en el próximo mensaje (ver crearYArrancarEjecucion) — sin esto,
      // el bot retomaba la conversación automáticamente pisando la escalación.
      await ctx.supabase.from('clientes').update({
        automatizado: false, flujo_activo_id: null, bot_bloqueado: true,
        ...(seleccionado ? { assigned_to: seleccionado } : {}),
      }).eq('id', clienteId)
    }
    // Cerrar la ejecución de flujo activa de esta conversación (si la hay) —
    // mismo estado que usa continuarEjecucion al terminar un flujo por 'fin',
    // para que iniciarFlujoParaConversacion no la retome en el próximo mensaje.
    await ctx.supabase.from('flujo_ejecuciones').update({
      estado: 'completado', updated_at: new Date().toISOString(),
    }).eq('conversacion_id', ctx.conversacionId).eq('estado', 'activo')
    await ctx.supabase.from('mensajes').insert({
      conversacion_id: ctx.conversacionId, tenant_id: ctx.tenantId, direccion: 'saliente',
      tipo: 'nota_interna', contenido: `🤖 Agente escaló a humano — motivo: ${motivo}`,
      enviado_por: null, estado_envio: 'enviado', leido_por_asesor: false,
    })
    return { ok: true, resultado: { escalado: true, asesor_asignado: seleccionado } }
  },
}

// ─── guardar_dato_cliente ──────────────────────────────────────────────────────
// Claves que además de quedar en la memoria del agente, se reflejan en la
// ficha real del cliente (mismo campo que usa el nodo "Capturar dato" del
// constructor de flujos) — así el dato queda visible en el CRM, no solo
// disponible para que el agente lo recuerde en la conversación.
const CAMPOS_CLIENTE_DIRECTOS: Record<string, string> = {
  nombre: 'nombre', celular: 'celular', email: 'email', cedula: 'cedula',
}

const guardarDatoCliente: HerramientaDef = {
  nombre: 'guardar_dato_cliente',
  descripcion: 'Guarda un dato relevante sobre el cliente para no perderlo entre mensajes. Úsala en cuanto el cliente lo mencione, aunque sea de pasada — ej. su nombre ("nombre"), celular ("celular"), correo ("email"), cédula ("cedula"), el modelo que le interesa ("modelo_interes"), si quiere financiamiento, una fecha que mencionó, etc.',
  parametros: {
    type: 'object',
    properties: {
      clave: { type: 'string', description: 'Nombre corto del dato. Usa "nombre", "celular", "email" o "cedula" cuando corresponda a esos datos exactos del cliente — se guardan directo en su ficha.' },
      valor: { type: 'string', description: 'Valor a recordar' },
    },
    required: ['clave', 'valor'],
  },
  async ejecutar(params, ctx) {
    if (!ctx.conversacionId) return { ok: false, error: 'Sin conversación activa' }
    const clave = String(params.clave ?? '').trim()
    if (!clave) return { ok: false, error: 'Falta la clave del dato' }
    const valor = String(params.valor ?? '').trim()

    const { data: existente } = await ctx.supabase
      .from('agente_memoria').select('datos').eq('agente_id', ctx.agenteId).eq('conversacion_id', ctx.conversacionId).maybeSingle()
    const datos = { ...(existente?.datos as Record<string, unknown> ?? {}), [clave]: params.valor }

    const { error } = await ctx.supabase.from('agente_memoria').upsert({
      agente_id: ctx.agenteId, conversacion_id: ctx.conversacionId, cliente_id: ctx.clienteId, datos,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'agente_id,conversacion_id' })
    if (error) return { ok: false, error: error.message }

    const campoCliente = CAMPOS_CLIENTE_DIRECTOS[clave.toLowerCase()]
    if (campoCliente && valor && ctx.clienteId) {
      await ctx.supabase.from('clientes').update({ [campoCliente]: valor }).eq('id', ctx.clienteId).eq('tenant_id', ctx.tenantId)
    }

    return { ok: true, resultado: { guardado: true } }
  },
}

export const CATALOGO_HERRAMIENTAS: Record<string, HerramientaDef> = {
  agendar_seguimiento: agendarSeguimiento,
  solicitar_fotos_producto: solicitarFotosProducto,
  iniciar_estudio_credito: iniciarEstudioCredito,
  consultar_inventario: consultarInventario,
  mover_pipeline: moverPipeline,
  escalar_a_humano: escalarAHumano,
  guardar_dato_cliente: guardarDatoCliente,
}

export const LISTA_HERRAMIENTAS: HerramientaDef[] = Object.values(CATALOGO_HERRAMIENTAS)
