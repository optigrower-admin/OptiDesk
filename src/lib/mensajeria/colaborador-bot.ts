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
  const esGerencia = ['gerencia', 'dueno'].includes(usuario.rol)

  // Actualizar sesión en todo mensaje recibido (reinicia la ventana de 24h)
  await supabase
    .from('usuarios')
    .update({ wa_sesion_at: new Date().toISOString() })
    .eq('id', usuario.id)

  // Confirmación de keep-alive
  if (lower === 'ok' || lower === 'si' || lower === 'sí') {
    await enviarWADirecto(cfg, usuario.whatsapp_number,
      `✅ Perfecto ${usuario.nombre?.split(' ')[0] ?? ''}. Sesión activa por 24 horas.\n\n` +
      buildMenu(usuario.nombre, esGerencia)
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
  const maxOpcion = esGerencia ? 5 : 4
  const opcion = parseInt(texto)
  if (!isNaN(opcion) && opcion >= 1 && opcion <= maxOpcion) {
    const result = await ejecutarOpcion(supabase, tenantId, usuario, esGerencia, opcion)
    await enviarWADirecto(cfg, usuario.whatsapp_number, result.texto)
    if (result.nuevoEstado !== undefined) {
      await supabase.from('usuarios').update({ bot_estado: result.nuevoEstado }).eq('id', usuario.id)
    }
    return
  }

  // Cualquier otro mensaje → mostrar menú
  await enviarWADirecto(cfg, usuario.whatsapp_number, buildMenu(usuario.nombre, esGerencia))
}

// ── Menú ───────────────────────────────────────────────────────────────────────

function buildMenu(nombre: string | null, esGerencia: boolean): string {
  const saludo = nombre ? `Hola *${nombre.split(' ')[0]}*! ` : ''
  if (esGerencia) {
    return (
      `${saludo}Panel de gerencia:\n\n` +
      `1. Clientes por etapa (todo el equipo)\n` +
      `2. Recordatorios pendientes\n` +
      `3. Buscar cliente\n` +
      `4. Órdenes activas\n` +
      `5. 💰 Saldo actual en caja\n\n` +
      `_Responde con el número de la opción_`
    )
  }
  return (
    `${saludo}¿Qué necesitas?\n\n` +
    `1. Mis clientes por etapa\n` +
    `2. Mis recordatorios pendientes\n` +
    `3. Buscar cliente\n` +
    `4. Órdenes activas\n\n` +
    `_Responde con el número de la opción_`
  )
}

// ── Ejecutar opción ────────────────────────────────────────────────────────────

async function ejecutarOpcion(
  supabase: Supabase,
  tenantId: string,
  usuario: UsuarioColaborador,
  esGerencia: boolean,
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
  if (opcion === 5 && esGerencia) {
    const texto = await saldoCaja(supabase, tenantId)
    return { texto }
  }
  return { texto: buildMenu(usuario.nombre, esGerencia) }
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

// ── Saldo actual en caja (solo gerencia/dueño) ─────────────────────────────────
// Replica la misma lógica de saldosCuentas + saldoCajaFuerte del módulo de Caja.

async function saldoCaja(supabase: Supabase, tenantId: string): Promise<string> {
  type WithMetodo = { metodos_pago: { nombre: string } | null; monto: number }
  type PagoRow    = WithMetodo & { ordenes: { tipo_orden: string } | null }
  type GastoRow   = WithMetodo & { descripcion: string }
  type AjusteRow  = WithMetodo & { cuenta_especial: string | null }
  type LavadoRow  = { metodos_pago: { nombre: string } | null; precio_venta_unitario: number; costo_unitario: number; cantidad: number }

  const [
    { data: pagos },
    { data: gastos },
    { data: ingresos },
    { data: ajustes },
    { data: pagosProveedor },
    { data: lavados },
  ] = await Promise.all([
    supabase.from('pagos_orden')
      .select('monto, metodos_pago(nombre), ordenes!inner(tipo_orden)')
      .eq('tenant_id', tenantId).gt('monto', 0),
    supabase.from('gastos_caja')
      .select('monto, descripcion, metodos_pago(nombre)')
      .eq('tenant_id', tenantId),
    supabase.from('ingresos_caja')
      .select('monto, metodos_pago(nombre)')
      .eq('tenant_id', tenantId),
    supabase.from('ajustes_caja')
      .select('monto, metodos_pago(nombre), cuenta_especial')
      .eq('tenant_id', tenantId),
    supabase.from('pagos_proveedor')
      .select('monto, metodos_pago(nombre)')
      .eq('tenant_id', tenantId),
    supabase.from('lava_moto_ordenes')
      .select('precio_venta_unitario, costo_unitario, cantidad, metodos_pago(nombre)')
      .eq('tenant_id', tenantId),
  ])

  const mp = (row: { metodos_pago: { nombre: string } | null }) =>
    (row.metodos_pago as { nombre: string } | null)?.nombre?.trim().toLowerCase() ?? 'otro'

  // saldo por cuenta (excluye caja fuerte)
  const saldo = new Map<string, number>()
  let saldoCF = 0

  const add = (key: string, cuentaEsp: string | null, monto: number) => {
    if (cuentaEsp === 'caja_fuerte') { saldoCF += monto; return }
    saldo.set(key, (saldo.get(key) ?? 0) + monto)
  }

  // Ingresos de clientes (pagos en órdenes)
  for (const p of (pagos ?? []) as PagoRow[])
    add(mp(p), null, p.monto)

  // Gastos (si es transferencia a CF, suma a CF y resta de la cuenta origen)
  for (const g of (gastos ?? []) as GastoRow[]) {
    const desc = g.descripcion?.trim().toLowerCase() ?? ''
    add(mp(g), null, -g.monto)
    if (desc.startsWith('transferencia a caja fuerte'))
      saldoCF += Math.abs(g.monto)
  }

  // Ingresos manuales a caja
  for (const i of (ingresos ?? []) as WithMetodo[])
    add(mp(i), null, i.monto)

  // Ajustes (pueden afectar caja fuerte via cuenta_especial)
  for (const a of (ajustes ?? []) as AjusteRow[])
    add(mp(a), a.cuenta_especial, a.monto)

  // Pagos a proveedor (egresos)
  for (const p of (pagosProveedor ?? []) as WithMetodo[])
    add(mp(p), null, -p.monto)

  // Lavado: solo el ingreso (precio_venta) — costo se omite para simplificar
  for (const l of (lavados ?? []) as LavadoRow[])
    add(mp(l), null, l.precio_venta_unitario * l.cantidad)

  // Desglose de ingresos: Serv. Técnico vs Repuestos
  let ingST = 0, ingRep = 0
  for (const p of (pagos ?? []) as PagoRow[]) {
    const tipo = (p.ordenes as { tipo_orden: string } | null)?.tipo_orden ?? ''
    if (tipo === 'venta_repuestos') ingRep += p.monto
    else ingST += p.monto
  }
  for (const l of (lavados ?? []) as LavadoRow[])
    ingST += l.precio_venta_unitario * l.cantidad

  // Formatear respuesta
  const COP = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`
  const ICON: Record<string, string> = { efectivo: '💵', nequi: '📲' }
  const PRIO = ['efectivo', 'nequi']

  const entries = [...saldo.entries()].sort((a, b) => {
    const ai = PRIO.indexOf(a[0]), bi = PRIO.indexOf(b[0])
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1; if (bi >= 0) return 1
    return a[0].localeCompare(b[0])
  })

  const totalCuentas = entries.reduce((s, [, v]) => s + v, 0)
  const totalGeneral = totalCuentas + saldoCF

  let msg = `💰 *Saldo Actual en Caja*\n━━━━━━━━━━━━━━━━━\n\n`
  for (const [k, v] of entries) {
    const ic = ICON[k] ?? '💳'
    msg += `${ic} *${k.charAt(0).toUpperCase() + k.slice(1)}:* ${COP(v)}\n`
  }
  if (saldoCF !== 0)
    msg += `🔒 *Caja Fuerte:* ${COP(saldoCF)}\n`
  msg += `\n*Total general:* ${COP(totalGeneral)}\n`
  msg += `\n─────────────────\n`
  msg += `📊 *Desglose ingresos:*\n`
  msg += `🔧 Serv. Técnico: ${COP(ingST)}\n`
  msg += `📦 Repuestos: ${COP(ingRep)}\n`

  return msg
}
