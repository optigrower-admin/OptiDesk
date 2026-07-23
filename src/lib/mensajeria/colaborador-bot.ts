import type { createAdminClient } from '@/lib/supabase/admin'
import { enviarWADirecto, type CfgMeta } from './enviar-wa-directo'

type Supabase = ReturnType<typeof createAdminClient>

interface UsuarioColaborador {
  id: string
  nombre: string | null
  rol: string
  whatsapp_number: string
  bot_estado: string | null
}

// ── Detección ──────────────────────────────────────────────────────────────────

export async function detectarColaborador(
  supabase: Supabase,
  tenantId: string,
  fromNumber: string
): Promise<UsuarioColaborador | null> {
  const { data } = await supabase
    .from('usuarios')
    .select('id, nombre, rol, whatsapp_number, bot_estado')
    .eq('tenant_id', tenantId)
    .eq('whatsapp_number', fromNumber)
    .eq('activo', true)
    .maybeSingle()
  return (data as UsuarioColaborador | null) ?? null
}

// ── Punto de entrada ───────────────────────────────────────────────────────────

export async function procesarMensajeColaborador(
  supabase: Supabase,
  tenantId: string,
  usuario: UsuarioColaborador,
  textoMensaje: string,
  cfg: CfgMeta
): Promise<void> {
  const texto  = textoMensaje.trim()
  const lower  = texto.toLowerCase()
  const estado = usuario.bot_estado ?? null
  const esGerencia  = ['gerencia', 'dueno'].includes(usuario.rol)
  const esAdmin     = usuario.rol === 'admin'
  const puedeVerCaja = esGerencia || esAdmin  // opción 5 disponible para estos roles

  // Actualizar sesión en todo mensaje recibido (reinicia la ventana de 24h)
  await supabase
    .from('usuarios')
    .update({ wa_sesion_at: new Date().toISOString() })
    .eq('id', usuario.id)

  // Confirmación de keep-alive
  if (lower === 'ok' || lower === 'si' || lower === 'sí') {
    await enviarWADirecto(cfg, usuario.whatsapp_number,
      `✅ Perfecto ${usuario.nombre?.split(' ')[0] ?? ''}. Sesión activa por 24 horas.\n\n` +
      buildMenu(usuario.nombre, esGerencia, puedeVerCaja)
    )
    return
  }

  // Estado: esperando término de búsqueda de cliente
  if (estado === 'buscar_cliente') {
    await supabase.from('usuarios').update({ bot_estado: null }).eq('id', usuario.id)
    const respuesta = await buscarCliente(supabase, tenantId, usuario.id, esGerencia, texto)
    await enviarWADirecto(cfg, usuario.whatsapp_number, respuesta)
    return
  }

  // Estado: esperando placa de moto
  if (estado === 'buscar_moto') {
    await supabase.from('usuarios').update({ bot_estado: null }).eq('id', usuario.id)
    const respuesta = await buscarMoto(supabase, tenantId, texto)
    await enviarWADirecto(cfg, usuario.whatsapp_number, respuesta)
    return
  }

  // Opción de menú numérica
  const maxOpcion = puedeVerCaja ? 5 : 4
  const opcion = parseInt(texto)
  if (!isNaN(opcion) && opcion >= 1 && opcion <= maxOpcion) {
    const result = await ejecutarOpcion(supabase, tenantId, usuario, esGerencia, puedeVerCaja, opcion)
    await enviarWADirecto(cfg, usuario.whatsapp_number, result.texto)
    if (result.nuevoEstado !== undefined) {
      await supabase.from('usuarios').update({ bot_estado: result.nuevoEstado }).eq('id', usuario.id)
    }
    return
  }

  // Cualquier otro mensaje → mostrar menú
  await enviarWADirecto(cfg, usuario.whatsapp_number, buildMenu(usuario.nombre, esGerencia, puedeVerCaja))
}

// ── Menú ───────────────────────────────────────────────────────────────────────

function buildMenu(nombre: string | null, esGerencia: boolean, puedeVerCaja: boolean): string {
  const saludo = nombre ? `Hola *${nombre.split(' ')[0]}*! ` : ''
  const opcion5 = puedeVerCaja ? `5. 💰 Saldo actual en caja\n\n` : `\n`
  if (esGerencia) {
    return (
      `${saludo}Panel de gerencia:\n\n` +
      `1. Clientes por etapa (todo el equipo)\n` +
      `2. Recordatorios pendientes\n` +
      `3. Buscar cliente\n` +
      `4. Órdenes activas\n` +
      opcion5 +
      `_Responde con el número de la opción_`
    )
  }
  return (
    `${saludo}¿Qué necesitas?\n\n` +
    `1. Mis clientes por etapa\n` +
    `2. Mis recordatorios pendientes\n` +
    `3. Buscar cliente\n` +
    `4. Órdenes activas\n` +
    opcion5 +
    `_Responde con el número de la opción_`
  )
}

// ── Ejecutar opción ────────────────────────────────────────────────────────────

async function ejecutarOpcion(
  supabase: Supabase,
  tenantId: string,
  usuario: UsuarioColaborador,
  esGerencia: boolean,
  puedeVerCaja: boolean,
  opcion: number
): Promise<{ texto: string; nuevoEstado?: string | null }> {
  if (opcion === 1) {
    const texto = await clientesPorEtapa(supabase, tenantId, esGerencia ? null : usuario.id)
    return { texto }
  }
  if (opcion === 2) {
    const texto = await recordatoriosPendientes(supabase, tenantId, usuario.id)
    return { texto }
  }
  if (opcion === 3) {
    return {
      texto: '🔍 ¿Nombre o cédula del cliente?',
      nuevoEstado: 'buscar_cliente',
    }
  }
  if (opcion === 4) {
    const texto = await ordenesActivas(supabase, tenantId)
    return { texto }
  }
  if (opcion === 5 && puedeVerCaja) {
    const texto = await saldoCaja(supabase, tenantId, esGerencia)
    return { texto }
  }
  return { texto: buildMenu(usuario.nombre, esGerencia, puedeVerCaja) }
}

// ── Consultas ──────────────────────────────────────────────────────────────────

async function clientesPorEtapa(
  supabase: Supabase,
  tenantId: string,
  userId: string | null
): Promise<string> {
  let query = supabase
    .from('clientes')
    .select('etapa_venta, assigned_to')
    .eq('tenant_id', tenantId)
    .eq('en_seguimiento_ventas', true)
    .not('etapa_venta', 'in', '("perdido","proceso_finalizado")')

  if (userId) query = query.eq('assigned_to', userId)

  const { data } = await query
  if (!data?.length) return '📊 No tienes clientes activos en seguimiento.'

  const conteo: Record<string, number> = {}
  for (const c of data) {
    const etapa = c.etapa_venta ?? 'sin_etapa'
    conteo[etapa] = (conteo[etapa] ?? 0) + 1
  }

  const LABELS: Record<string, string> = {
    nuevo_mensaje: 'Nuevo Contacto', nuevo: 'Nuevo', con_interes: 'Con Interés',
    con_objecion: 'Con Objeción', propuesta: 'Propuesta', demo: 'Cita',
    seguimiento: 'Seguimiento', buscando_credito: 'Buscando Crédito',
    en_proceso_credito: 'En Proceso Crédito', negociacion: 'Calificado',
    ganado: 'Vendida', aprobado_matricula: 'Aprobado Matrícula',
    en_matricula: 'En Matrícula', alistamiento: 'Alistamiento',
    espera_entrega: 'Espera Entrega', entregada: 'Entregada',
  }

  const total = data.length
  const lineas = Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .map(([etapa, n]) => `• ${LABELS[etapa] ?? etapa}: *${n}*`)
    .join('\n')

  return `📊 *Clientes activos: ${total}*\n\n${lineas}`
}

async function recordatoriosPendientes(
  supabase: Supabase,
  tenantId: string,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('recordatorios')
    .select('nota, fecha_recordatorio, clientes(nombre)')
    .eq('tenant_id', tenantId)
    .eq('asignado_a', userId)
    .eq('completado', false)
    .not('cliente_id', 'is', null)
    .lte('fecha_recordatorio', new Date().toISOString())
    .order('fecha_recordatorio', { ascending: true })
    .limit(10)

  if (!data?.length) return '✅ No tienes recordatorios vencidos.'

  const lineas = (data as Array<{
    nota: string | null
    fecha_recordatorio: string | null
    clientes: { nombre: string | null }[] | null
  }>).map(r => {
    const nombre = r.clientes?.[0]?.nombre ?? 'Cliente'
    const nota   = r.nota ? ` — ${r.nota.slice(0, 60)}` : ''
    return `• *${nombre}*${nota}`
  }).join('\n')

  return `⏰ *Recordatorios vencidos (${data.length}):*\n\n${lineas}`
}

async function buscarCliente(
  supabase: Supabase,
  tenantId: string,
  userId: string,
  esGerencia: boolean,
  termino: string
): Promise<string> {
  const t = termino.trim()
  if (t.length < 2) return '❌ Escribe al menos 2 caracteres para buscar.'

  let query = supabase
    .from('clientes')
    .select('nombre, celular, etapa_venta, assigned_to, cedula')
    .eq('tenant_id', tenantId)
    .eq('en_seguimiento_ventas', true)

  if (!esGerencia) query = query.eq('assigned_to', userId)

  // Buscar por nombre o cédula
  if (/^\d+$/.test(t)) {
    query = query.ilike('cedula', `%${t}%`)
  } else {
    query = query.ilike('nombre', `%${t}%`)
  }

  const { data } = await query.limit(5)
  if (!data?.length) return `🔍 No se encontró ningún cliente con "${t}".`

  const ETAPA: Record<string, string> = {
    nuevo_mensaje: 'Nuevo Contacto', nuevo: 'Nuevo', con_interes: 'Con Interés',
    con_objecion: 'Con Objeción', propuesta: 'Propuesta', demo: 'Cita',
    seguimiento: 'Seguimiento', buscando_credito: 'Crédito', negociacion: 'Calificado',
    ganado: 'Vendida', entregada: 'Entregada',
  }

  const lineas = (data as Array<{
    nombre: string | null; celular: string | null; etapa_venta: string | null; cedula: string | null
  }>).map(c => {
    const etapa = ETAPA[c.etapa_venta ?? ''] ?? c.etapa_venta ?? ''
    const cel   = c.celular ? ` · ${c.celular}` : ''
    return `• *${c.nombre ?? 'Sin nombre'}*${cel}\n  _${etapa}_`
  }).join('\n\n')

  return `🔍 *Resultados para "${t}":*\n\n${lineas}`
}

async function buscarMoto(
  supabase: Supabase,
  tenantId: string,
  placa: string
): Promise<string> {
  const p = placa.trim().toUpperCase()
  const { data: moto } = await supabase
    .from('motos')
    .select('placa, marca, modelo, color, clientes(nombre, celular)')
    .eq('tenant_id', tenantId)
    .ilike('placa', p)
    .maybeSingle()

  if (!moto) return `🔍 No se encontró la moto con placa *${p}*.`

  const m = moto as {
    placa: string; marca: string | null; modelo: string | null; color: string | null
    clientes: { nombre: string | null; celular: string | null }[] | null
  }
  const cliente = m.clientes?.[0]
  let texto = `🏍️ *Placa: ${m.placa}*\n${[m.marca, m.modelo, m.color].filter(Boolean).join(' · ')}`
  if (cliente?.nombre) texto += `\n👤 ${cliente.nombre}`
  if (cliente?.celular) texto += ` · ${cliente.celular}`

  // Última orden activa
  const { data: orden } = await supabase
    .from('ordenes')
    .select('numero, estado, tipo_orden, created_at')
    .eq('tenant_id', tenantId)
    .eq('placa', p)
    .not('estado', 'in', '("finalizada","cancelada")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (orden) {
    const o = orden as { numero: string | null; estado: string; tipo_orden: string }
    texto += `\n\n📋 Orden activa: ${o.numero ?? ''} · ${o.estado} · ${o.tipo_orden}`
  }

  return texto
}

async function ordenesActivas(
  supabase: Supabase,
  tenantId: string
): Promise<string> {
  const { data } = await supabase
    .from('ordenes')
    .select('numero, placa, cliente, estado, tipo_orden')
    .eq('tenant_id', tenantId)
    .not('estado', 'in', '("finalizada","cancelada")')
    .order('created_at', { ascending: false })
    .limit(15)

  if (!data?.length) return '✅ No hay órdenes activas en este momento.'

  const lineas = (data as Array<{
    numero: string | null; placa: string | null; cliente: string | null; estado: string; tipo_orden: string
  }>).map(o => {
    const ref = o.placa ?? o.cliente ?? '—'
    return `• *${o.numero ?? '—'}* ${ref} · ${o.estado}`
  }).join('\n')

  return `📋 *Órdenes activas (${data.length}):*\n\n${lineas}`
}

// ── Saldo actual en caja ───────────────────────────────────────────────────────
// Usa query separada de metodos_pago para resolver nombres (sin joins FK),
// ya que el admin client (plain supabase-js) puede fallar silenciosamente con
// el sintaxis de join metodos_pago(nombre) cuando RLS está activo en esa tabla.

async function saldoCaja(supabase: Supabase, tenantId: string, mostrarCajaFuerte: boolean): Promise<string> {
  // 1. Cargar métodos de pago como lookup id→nombre
  const { data: metodos } = await supabase
    .from('metodos_pago')
    .select('id, nombre')
    .eq('tenant_id', tenantId)

  const byId = new Map<string, string>(
    ((metodos ?? []) as { id: string; nombre: string }[]).map(m => [m.id, m.nombre.trim().toLowerCase()])
  )
  const metodName = (id: string | null) => (id ? byId.get(id) ?? 'otro' : 'otro')

  // 2. Consultar todos los movimientos de caja (sin join — solo metodo_pago_id)
  // lava_moto_ordenes se excluye: su ingreso ya está en pagos_orden y su costo
  // requiere lógica condicional (mostrarItemsPorSeparado) que no se puede replicar aquí.
  const [
    { data: pagos,         error: e1 },
    { data: gastos,        error: e2 },
    { data: ingresos,      error: e3 },
    { data: ajustes,       error: e4 },
    { data: pagosProveedor,error: e5 },
  ] = await Promise.all([
    supabase.from('pagos_orden')
      .select('monto, metodo_pago_id').eq('tenant_id', tenantId).gt('monto', 0),
    supabase.from('gastos_caja')
      .select('monto, descripcion, metodo_pago_id').eq('tenant_id', tenantId),
    supabase.from('ingresos_caja')
      .select('monto, metodo_pago_id').eq('tenant_id', tenantId),
    supabase.from('ajustes_caja')
      .select('monto, metodo_pago_id, cuenta_especial').eq('tenant_id', tenantId),
    supabase.from('pagos_proveedor')
      .select('monto, metodo_pago_id').eq('tenant_id', tenantId),
  ])

  if (e1 || e2 || e3 || e4 || e5) {
    const msg = [e1, e2, e3, e4, e5]
      .filter(Boolean).map(e => e!.message).join('; ')
    return `❌ Error al consultar caja: ${msg}`
  }

  // 3. Acumular saldo por cuenta
  const saldo = new Map<string, number>()
  let saldoCF = 0

  const add = (id: string | null, cuentaEsp: string | null, monto: number) => {
    if (cuentaEsp === 'caja_fuerte') { saldoCF += monto; return }
    const key = metodName(id)
    saldo.set(key, (saldo.get(key) ?? 0) + monto)
  }

  for (const p of (pagos ?? []) as { monto: number; metodo_pago_id: string | null }[])
    add(p.metodo_pago_id, null, p.monto)

  for (const g of (gastos ?? []) as { monto: number; descripcion: string; metodo_pago_id: string | null }[]) {
    const desc = (g.descripcion ?? '').trim().toLowerCase()
    add(g.metodo_pago_id, null, -g.monto)
    if (desc.startsWith('transferencia a caja fuerte'))
      saldoCF += Math.abs(g.monto)
  }

  for (const i of (ingresos ?? []) as { monto: number; metodo_pago_id: string | null }[])
    add(i.metodo_pago_id, null, i.monto)

  for (const a of (ajustes ?? []) as { monto: number; metodo_pago_id: string | null; cuenta_especial: string | null }[])
    add(a.metodo_pago_id, a.cuenta_especial, a.monto)

  for (const p of (pagosProveedor ?? []) as { monto: number; metodo_pago_id: string | null }[])
    add(p.metodo_pago_id, null, -p.monto)

  // 4. Formatear respuesta
  const COP = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`
  const ICON: Record<string, string> = { efectivo: '💵', nequi: '📲' }
  const PRIO = ['efectivo', 'nequi']

  const entries = [...saldo.entries()]
    .filter(([, v]) => v !== 0)
    .sort((a, b) => {
      const ai = PRIO.indexOf(a[0]), bi = PRIO.indexOf(b[0])
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1; if (bi >= 0) return 1
      return a[0].localeCompare(b[0])
    })

  const totalCuentas = entries.reduce((s, [, v]) => s + v, 0)
  const totalGeneral = totalCuentas + (mostrarCajaFuerte ? saldoCF : 0)

  let msg = `💰 *Saldo Actual en Caja*\n━━━━━━━━━━━━━━━━━\n\n`
  for (const [k, v] of entries) {
    const ic = ICON[k] ?? '💳'
    msg += `${ic} *${k.charAt(0).toUpperCase() + k.slice(1)}:* ${COP(v)}\n`
  }
  if (mostrarCajaFuerte && saldoCF !== 0)
    msg += `🔒 *Caja Fuerte:* ${COP(saldoCF)}\n`
  msg += `\n*Total general:* ${COP(totalGeneral)}\n`

  return msg
}
