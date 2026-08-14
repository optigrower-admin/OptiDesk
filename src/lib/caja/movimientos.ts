import type { SupabaseClient } from '@supabase/supabase-js'

// Compartido entre la página de Caja (cliente de navegador) y el cron de
// cierre diario (cliente admin) — por eso vive en /lib en vez de en la page,
// y por eso recibe el cliente de Supabase como parámetro en vez de crearlo.

export type Categoria = 'ingreso_st' | 'ingreso_venta' | 'ingreso_insumo' | 'ingreso_lavado' | 'ingreso_externo' | 'ingreso_manual' | 'costo_externo' | 'costo_lavado' | 'pago_proveedor' | 'exceso_proveedor' | 'gasto' | 'ajuste' | 'porta_placas' | 'pago_colaborador'

export interface Movimiento {
  id: string
  rawId: string
  fecha: string
  categoria: Categoria
  concepto: string
  nombre: string | null
  codigo: string | null
  monto: number // con signo: positivo = ingreso, negativo = salida
  metodoPagoId: string | null
  metodoPago: string | null
  cuentaEspecial: 'caja_fuerte' | null
  grupo: string
}

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  ingreso_st:      'Ingresos Servicio Técnico',
  ingreso_venta:   'Ingresos Venta repuesto directa',
  ingreso_insumo:  'Ingresos Insumos',
  ingreso_lavado:  'Ingresos Servicio de Lavado',
  ingreso_externo: 'Ingresos repuestos Externos/Terceros',
  ingreso_manual:  'Ingreso a Caja',
  costo_externo:   'Costo repuestos Externos/Terceros',
  costo_lavado:    'Costo Servicio de Lavado',
  pago_proveedor:  'Pago proveedor (provisional)',
  exceso_proveedor: 'Exceso pago proveedor',
  gasto:           'Gastos de Caja',
  ajuste:          'Ajuste de Caja',
  porta_placas:    'Porta Placas',
  pago_colaborador: 'Pago Colaborador',
}

export const CATEGORIAS_CON_CUENTA: Categoria[] = ['ingreso_st', 'ingreso_venta', 'ingreso_manual', 'gasto', 'costo_lavado', 'costo_externo', 'pago_proveedor', 'exceso_proveedor', 'ajuste', 'pago_colaborador']

// "Caja fuerte" no es un método de pago del catálogo, es una cuenta independiente
// donde Gerencia/Dueño guardan parte del dinero. Se alimenta de las transferencias
// hechas con el botón "Transferir a caja fuerte" (un gasto en la cuenta de origen,
// detectado por este texto en el concepto) y de los ajustes registrados directo
// contra "Caja fuerte" (cuenta_especial).
export const TRANSFERENCIA_CAJA_FUERTE = 'transferencia a caja fuerte'

export function esTransferenciaConcepto(concepto: string): boolean {
  return concepto.trim().toLowerCase().startsWith('transferencia')
}

export function grupoOrden(ord: { numero: number; placa: string; cliente: string } | null): string {
  return ord ? `Orden #${ord.numero} (${ord.placa ?? '—'}) · ${ord.cliente ?? 'Cliente'}` : 'Sin orden asociada'
}

// Construye la lista de movimientos para un tenant. Si desdeISO/hastaISO son null no se
// filtra por fecha (uso para el saldo histórico, que no depende del período seleccionado).
export async function construirMovimientos(
  supabase: SupabaseClient,
  tenantId: string,
  desdeISO: string | null,
  hastaISO: string | null
): Promise<Movimiento[]> {
  let qPagos = supabase.from('pagos_orden')
    .select('id, orden_id, monto, fecha, metodo_pago_id, metodos_pago(nombre), ordenes(numero, placa, cliente, tipo_orden)')
    .eq('tenant_id', tenantId)
  if (desdeISO) qPagos = qPagos.gte('fecha', desdeISO)
  if (hastaISO) qPagos = qPagos.lte('fecha', hastaISO)

  let qCostosExt = supabase.from('items_orden')
    .select('id, orden_id, descripcion, costo, precio_venta, cantidad, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente, tipo_orden)')
    .eq('origen', 'externo')
    .eq('ordenes.tenant_id', tenantId)
    .or('costo.gt.0,precio_venta.gt.0')
  if (desdeISO) qCostosExt = qCostosExt.gte('created_at', desdeISO)
  if (hastaISO) qCostosExt = qCostosExt.lte('created_at', hastaISO)

  let qGastos = supabase.from('gastos_caja')
    .select('id, descripcion, monto, fecha, metodo_pago_id, metodos_pago(nombre)')
    .eq('tenant_id', tenantId)
  if (desdeISO) qGastos = qGastos.gte('fecha', desdeISO)
  if (hastaISO) qGastos = qGastos.lte('fecha', hastaISO)

  let qInsumos = supabase.from('items_orden')
    .select('id, descripcion, precio_venta, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente, tipo_orden)')
    .eq('origen', 'insumo')
    .eq('ordenes.tenant_id', tenantId)
  if (desdeISO) qInsumos = qInsumos.gte('created_at', desdeISO)
  if (hastaISO) qInsumos = qInsumos.lte('created_at', hastaISO)

  let qLavados = supabase.from('lava_moto_ordenes')
    .select('id, orden_id, costo_unitario, precio_venta_unitario, cantidad, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente, tipo_orden)')
    .eq('ordenes.tenant_id', tenantId)
    .or('costo_unitario.gt.0,precio_venta_unitario.gt.0')
  if (desdeISO) qLavados = qLavados.gte('created_at', desdeISO)
  if (hastaISO) qLavados = qLavados.lte('created_at', hastaISO)

  let qVentaDirecta = supabase.from('ordenes')
    .select('id, numero, placa, cliente, valor_abono, metodo_pago_id, metodos_pago(nombre), created_at')
    .eq('tenant_id', tenantId)
    .eq('tipo_orden', 'venta_repuestos')
    .gt('valor_abono', 0)
  if (desdeISO) qVentaDirecta = qVentaDirecta.gte('created_at', desdeISO)
  if (hastaISO) qVentaDirecta = qVentaDirecta.lte('created_at', hastaISO)

  let qAjustes = supabase.from('ajustes_caja')
    .select('id, descripcion, monto, fecha, metodo_pago_id, metodos_pago(nombre), cuenta_especial')
    .eq('tenant_id', tenantId)
  if (desdeISO) qAjustes = qAjustes.gte('fecha', desdeISO)
  if (hastaISO) qAjustes = qAjustes.lte('fecha', hastaISO)

  let qIngresos = supabase.from('ingresos_caja')
    .select('id, descripcion, monto, fecha, metodo_pago_id, metodos_pago(nombre)')
    .eq('tenant_id', tenantId)
  if (desdeISO) qIngresos = qIngresos.gte('fecha', desdeISO)
  if (hastaISO) qIngresos = qIngresos.lte('fecha', hastaISO)

  let qPagosColab = supabase.from('pagos_colaborador_caja')
    .select('id, descripcion, monto, fecha, metodo_pago_id, metodos_pago(nombre), usuario_pagado_id, usuarios!usuario_pagado_id(nombre)')
    .eq('tenant_id', tenantId)
  if (desdeISO) qPagosColab = qPagosColab.gte('fecha', desdeISO)
  if (hastaISO) qPagosColab = qPagosColab.lte('fecha', hastaISO)

  let qPagosProvPeriodo = supabase.from('pagos_proveedor')
    .select('id, orden_id, monto, fecha, metodo_pago_id, metodos_pago(nombre), ordenes(numero, placa, cliente)')
    .eq('tenant_id', tenantId)
  if (desdeISO) qPagosProvPeriodo = qPagosProvPeriodo.gte('fecha', desdeISO)
  if (hastaISO) qPagosProvPeriodo = qPagosProvPeriodo.lte('fecha', hastaISO)

  const [{ data: pagos }, { data: costosExt }, { data: gastos }, { data: insumos }, { data: lavados }, { data: ventaDirecta }, { data: ajustes }, { data: ingresos }, { data: pagosProvPeriodo }, { data: pagosColab }] =
    await Promise.all([qPagos, qCostosExt, qGastos, qInsumos, qLavados, qVentaDirecta, qAjustes, qIngresos, qPagosProvPeriodo, qPagosColab])

  const lista: Movimiento[] = []

  // ── Determinar estado de pago a proveedor por orden ─────────────────────────
  // Colectamos los orden_ids que tienen costos externos o lavado en el período.
  const ordenIdsConCosto = new Set<string>()
  for (const it of (costosExt ?? []) as unknown as { orden_id: string; costo: number }[]) {
    if (it.costo > 0) ordenIdsConCosto.add(it.orden_id)
  }
  for (const lm of (lavados ?? []) as unknown as { orden_id: string; costo_unitario: number }[]) {
    if (lm.costo_unitario > 0) ordenIdsConCosto.add(lm.orden_id)
  }
  // También incluir las órdenes de pagos_proveedor del período para el cálculo.
  for (const pp of (pagosProvPeriodo ?? []) as unknown as { orden_id: string }[]) {
    ordenIdsConCosto.add(pp.orden_id)
  }

  const totalCostoPorOrden = new Map<string, number>()
  const totalPagadoPorOrden = new Map<string, number>()
  const ultimaFechaPagoPorOrden = new Map<string, string>()
  const ordenesConGestion = new Set<string>()
  const estadoPorOrden = new Map<string, string>()
  const estadoPagoPorOrden = new Map<string, string>()
  const ordenInfoPorOrden = new Map<string, { numero: number; placa: string; cliente: string }>()

  // Ítems/lavados completos (no solo orden_id+costo) de las órdenes con costo,
  // sin filtrar por fecha — hacen falta para poder mostrar en el período
  // correcto el costo de una orden que se pagó en este período aunque el
  // repuesto se haya agregado a la orden en un período anterior.
  let costosExtTodos: NonNullable<typeof costosExt> = []
  let lavadosTodos: NonNullable<typeof lavados> = []
  if (ordenIdsConCosto.size > 0) {
    const ordenIds = [...ordenIdsConCosto]
    const [r1, r1b, r2, r2b, r3, r4] = await Promise.all([
      supabase.from('items_orden').select('orden_id, costo, cantidad').eq('origen', 'externo').in('orden_id', ordenIds),
      supabase.from('items_orden').select('id, orden_id, descripcion, costo, precio_venta, cantidad, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente, tipo_orden)')
        .eq('origen', 'externo').eq('ordenes.tenant_id', tenantId).gt('costo', 0).in('orden_id', ordenIds),
      supabase.from('lava_moto_ordenes').select('orden_id, costo_unitario, cantidad').in('orden_id', ordenIds),
      supabase.from('lava_moto_ordenes').select('id, orden_id, costo_unitario, precio_venta_unitario, cantidad, created_at, metodo_pago_id, metodos_pago(nombre), ordenes!inner(tenant_id, numero, placa, cliente, tipo_orden)')
        .eq('ordenes.tenant_id', tenantId).gt('costo_unitario', 0).in('orden_id', ordenIds),
      supabase.from('pagos_proveedor').select('orden_id, monto, fecha').in('orden_id', ordenIds).eq('tenant_id', tenantId),
      supabase.from('ordenes').select('id, gestiona_pago_proveedor, estado, estado_pago, numero, placa, cliente').in('id', ordenIds),
    ])
    costosExtTodos = (r1b.data ?? []) as unknown as NonNullable<typeof costosExt>
    lavadosTodos = (r2b.data ?? []) as unknown as NonNullable<typeof lavados>
    for (const it of (r1.data ?? []) as { orden_id: string; costo: number; cantidad: number }[]) {
      totalCostoPorOrden.set(it.orden_id, (totalCostoPorOrden.get(it.orden_id) ?? 0) + it.costo * it.cantidad)
    }
    for (const lm of (r2.data ?? []) as { orden_id: string; costo_unitario: number; cantidad: number }[]) {
      totalCostoPorOrden.set(lm.orden_id, (totalCostoPorOrden.get(lm.orden_id) ?? 0) + lm.costo_unitario * lm.cantidad)
    }
    for (const pp of (r3.data ?? []) as { orden_id: string; monto: number; fecha: string }[]) {
      totalPagadoPorOrden.set(pp.orden_id, (totalPagadoPorOrden.get(pp.orden_id) ?? 0) + pp.monto)
      // Fecha del último pago a proveedor de la orden — el gasto de Caja debe
      // quedar registrado el día que el dinero realmente salió (se pagó al
      // proveedor), no el día que el repuesto se agregó a la orden.
      const actual = ultimaFechaPagoPorOrden.get(pp.orden_id)
      if (!actual || pp.fecha > actual) ultimaFechaPagoPorOrden.set(pp.orden_id, pp.fecha)
    }
    for (const ord of (r4.data ?? []) as { id: string; gestiona_pago_proveedor: boolean; estado: string; estado_pago: string; numero: number; placa: string; cliente: string }[]) {
      if (ord.gestiona_pago_proveedor) ordenesConGestion.add(ord.id)
      estadoPorOrden.set(ord.id, ord.estado ?? '')
      estadoPagoPorOrden.set(ord.id, ord.estado_pago ?? '')
      ordenInfoPorOrden.set(ord.id, { numero: ord.numero, placa: ord.placa, cliente: ord.cliente })
    }
  }

  function esProveedorPagado(ordenId: string): boolean {
    if (!ordenesConGestion.has(ordenId)) return true  // orden antigua: comportamiento previo
    const costo = totalCostoPorOrden.get(ordenId) ?? 0
    if (costo === 0) return true
    return (totalPagadoPorOrden.get(ordenId) ?? 0) >= costo
  }

  // Mostrar ítems individuales solo cuando la orden está cerrada completamente:
  // finalizada + cliente pagado 100% + proveedor pagado 100%.
  // En cualquier otro caso, mostrar filas de pagos_proveedor (una por abono).
  function mostrarItemsPorSeparado(ordenId: string): boolean {
    if (!ordenesConGestion.has(ordenId)) return true  // orden antigua: siempre por ítem
    const estado = estadoPorOrden.get(ordenId) ?? ''
    const estadoPago = estadoPagoPorOrden.get(ordenId) ?? ''
    const finalizado = estado === 'listo' || estado === 'pagado'
    const clientePagado = estadoPago === 'pagado'
    return finalizado && clientePagado && esProveedorPagado(ordenId)
  }

  // Una venta directa de repuestos puede recibir su pago desde la pantalla
  // general de la orden (que registra en pagos_orden) en vez de la pantalla
  // de Repuestos (que solo actualiza ordenes.valor_abono). Si ya tiene algún
  // pago en pagos_orden, esa es la fuente de verdad — no se vuelve a contar
  // el mismo ingreso por el lado de ordenes.valor_abono.
  const ordenesConPagoRegistrado = new Set<string>()

  for (const p of (pagos ?? []) as unknown as { id: string; orden_id: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
    const ord = p.ordenes
    const esVenta = ord?.tipo_orden === 'venta_repuestos'
    if (esVenta) ordenesConPagoRegistrado.add(p.orden_id)
    lista.push({
      id: `pago_${p.id}`,
      rawId: p.id,
      fecha: p.fecha,
      categoria: esVenta ? 'ingreso_venta' : 'ingreso_st',
      concepto: `${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`,
      nombre: ord?.cliente ?? null,
      codigo: ord?.placa ?? null,
      monto: p.monto,
      metodoPagoId: p.metodo_pago_id,
      metodoPago: p.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: grupoOrden(ord),
    })
  }

  for (const v of (ventaDirecta ?? []) as unknown as { id: string; numero: number; placa: string; cliente: string; valor_abono: number; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; created_at: string }[]) {
    if (ordenesConPagoRegistrado.has(v.id)) continue
    lista.push({
      id: `ventadirecta_${v.id}`,
      rawId: v.id,
      fecha: v.created_at,
      categoria: 'ingreso_venta',
      concepto: `${v.cliente ?? 'Cliente'} · Orden #${v.numero ?? '—'} (${v.placa ?? '—'})`,
      nombre: v.cliente ?? null,
      codigo: v.placa ?? null,
      monto: v.valor_abono,
      metodoPagoId: v.metodo_pago_id,
      metodoPago: v.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: grupoOrden({ numero: v.numero, placa: v.placa, cliente: v.cliente }),
    })
  }

  // Unir lo que ya cayó dentro del período por fecha de creación con lo que
  // se liquidó (se le pagó al proveedor) en este período aunque el repuesto
  // se haya agregado antes — sin duplicar filas. Solo aporta filas de COSTO
  // (reubicadas a la fecha real de pago); el ingreso por venta del repuesto
  // sigue reconociéndose únicamente en su fecha de creación original, para
  // no hacer aparecer ingresos fuera del período que se está viendo.
  const costosExtVistos = new Set((costosExt ?? []).map((it: { id: string }) => it.id))
  const costosExtSoloLiquidados = costosExtTodos.filter((it: { id: string; orden_id: string }) => {
    if (costosExtVistos.has(it.id)) return false
    const fechaPago = ultimaFechaPagoPorOrden.get(it.orden_id)
    if (!fechaPago) return false
    if (desdeISO && fechaPago < desdeISO) return false
    if (hastaISO && fechaPago > hastaISO) return false
    return true
  })

  for (const it of (costosExt ?? []) as unknown as { id: string; orden_id: string; descripcion: string; costo: number; precio_venta: number; cantidad: number; created_at: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
    const ord = it.ordenes
    const concepto = `${it.descripcion} · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`
    if (it.costo > 0 && mostrarItemsPorSeparado(it.orden_id)) {
      lista.push({
        id: `extcosto_${it.id}`,
        rawId: it.id,
        fecha: ultimaFechaPagoPorOrden.get(it.orden_id) ?? it.created_at,
        categoria: 'costo_externo',
        concepto,
        nombre: it.descripcion,
        codigo: ord?.placa ?? null,
        monto: -(it.costo * it.cantidad),
        metodoPagoId: it.metodo_pago_id,
        metodoPago: it.metodos_pago?.nombre ?? null,
        cuentaEspecial: null,
        grupo: grupoOrden(ord),
      })
    }
    // El ingreso por venta del repuesto externo solo se cuenta aparte cuando es una
    // Venta de repuestos directa. En Servicio Técnico ese valor ya está incluido en el
    // pago total de la orden (Ingresos Servicio Técnico), así que contarlo aquí también
    // duplicaría el ingreso.
    if (it.precio_venta > 0 && ord?.tipo_orden !== 'servicio') {
      lista.push({
        id: `extingreso_${it.id}`,
        rawId: it.id,
        fecha: it.created_at,
        categoria: 'ingreso_externo',
        concepto,
        nombre: it.descripcion,
        codigo: ord?.placa ?? null,
        monto: it.precio_venta * it.cantidad,
        metodoPagoId: it.metodo_pago_id,
        metodoPago: it.metodos_pago?.nombre ?? null,
        cuentaEspecial: null,
        grupo: grupoOrden(ord),
      })
    }
  }

  // Costos de repuestos externos que se liquidaron (se pagó al proveedor)
  // dentro de este período, aunque el repuesto se haya agregado antes.
  for (const it of costosExtSoloLiquidados as unknown as { id: string; orden_id: string; descripcion: string; costo: number; cantidad: number; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
    const ord = it.ordenes
    if (!mostrarItemsPorSeparado(it.orden_id)) continue
    lista.push({
      id: `extcosto_${it.id}`,
      rawId: it.id,
      fecha: ultimaFechaPagoPorOrden.get(it.orden_id)!,
      categoria: 'costo_externo',
      concepto: `${it.descripcion} · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`,
      nombre: it.descripcion,
      codigo: ord?.placa ?? null,
      monto: -(it.costo * it.cantidad),
      metodoPagoId: it.metodo_pago_id,
      metodoPago: it.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: grupoOrden(ord),
    })
  }

  for (const lm of (lavados ?? []) as unknown as { id: string; orden_id: string; costo_unitario: number; precio_venta_unitario: number; cantidad: number; created_at: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
    const ord = lm.ordenes
    const concepto = `Servicio de lavado · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`
    if (lm.costo_unitario > 0 && mostrarItemsPorSeparado(lm.orden_id)) {
      lista.push({
        id: `lavadocosto_${lm.id}`,
        rawId: lm.id,
        fecha: ultimaFechaPagoPorOrden.get(lm.orden_id) ?? lm.created_at,
        categoria: 'costo_lavado',
        concepto,
        nombre: 'Servicio de lavado',
        codigo: ord?.placa ?? null,
        monto: -(lm.costo_unitario * lm.cantidad),
        metodoPagoId: lm.metodo_pago_id,
        metodoPago: lm.metodos_pago?.nombre ?? null,
        cuentaEspecial: null,
        grupo: grupoOrden(ord),
      })
    }
    // Igual que con repuestos externos: si la orden es Servicio Técnico, este ingreso
    // ya está incluido en el pago total de la orden — no se cuenta aparte.
    if (lm.precio_venta_unitario > 0 && ord?.tipo_orden !== 'servicio') {
      lista.push({
        id: `lavadoingreso_${lm.id}`,
        rawId: lm.id,
        fecha: lm.created_at,
        categoria: 'ingreso_lavado',
        concepto,
        nombre: 'Servicio de lavado',
        codigo: ord?.placa ?? null,
        monto: lm.precio_venta_unitario * lm.cantidad,
        metodoPagoId: null,
        metodoPago: null,
        cuentaEspecial: null,
        grupo: grupoOrden(ord),
      })
    }
  }

  // Igual que con repuestos externos: costo de lavado liquidado (pagado al
  // proveedor) dentro de este período aunque se haya agregado antes.
  const lavadosVistos = new Set((lavados ?? []).map((lm: { id: string }) => lm.id))
  const lavadosSoloLiquidados = lavadosTodos.filter((lm: { id: string; orden_id: string }) => {
    if (lavadosVistos.has(lm.id)) return false
    const fechaPago = ultimaFechaPagoPorOrden.get(lm.orden_id)
    if (!fechaPago) return false
    if (desdeISO && fechaPago < desdeISO) return false
    if (hastaISO && fechaPago > hastaISO) return false
    return true
  })
  for (const lm of lavadosSoloLiquidados as unknown as { id: string; orden_id: string; costo_unitario: number; cantidad: number; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
    const ord = lm.ordenes
    if (!mostrarItemsPorSeparado(lm.orden_id)) continue
    lista.push({
      id: `lavadocosto_${lm.id}`,
      rawId: lm.id,
      fecha: ultimaFechaPagoPorOrden.get(lm.orden_id)!,
      categoria: 'costo_lavado',
      concepto: `Servicio de lavado · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`,
      nombre: 'Servicio de lavado',
      codigo: ord?.placa ?? null,
      monto: -(lm.costo_unitario * lm.cantidad),
      metodoPagoId: lm.metodo_pago_id,
      metodoPago: lm.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: grupoOrden(ord),
    })
  }

  // Pagos a proveedor en el período: aparecen como provisional cuando el proveedor
  // no está pagado al 100%, o se omiten cuando ya aparecen los ítems individuales.
  for (const pp of (pagosProvPeriodo ?? []) as unknown as { id: string; orden_id: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string } | null }[]) {
    if (mostrarItemsPorSeparado(pp.orden_id)) continue
    const ord = pp.ordenes
    lista.push({
      id: `pagoprov_${pp.id}`,
      rawId: pp.id,
      fecha: pp.fecha,
      categoria: 'pago_proveedor',
      concepto: `Pago proveedor · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'}) · ${ord?.cliente ?? 'Cliente'}`,
      nombre: ord?.cliente ?? null,
      codigo: ord?.placa ?? null,
      monto: -pp.monto,
      metodoPagoId: pp.metodo_pago_id,
      metodoPago: pp.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: grupoOrden(ord),
    })
  }

  // Si en total se le pagó al proveedor más de lo que costaban los repuestos/lavado
  // registrados por ítem (ej. el proveedor cobró más de lo negociado), ese exceso
  // se muestra como una fila aparte "Exceso pago proveedor" — así no se altera el
  // costo por ítem ya mostrado, pero el total en Caja sigue cuadrando con lo que
  // realmente salió de caja.
  for (const ordenId of ordenIdsConCosto) {
    if (!mostrarItemsPorSeparado(ordenId)) continue
    const costo = totalCostoPorOrden.get(ordenId) ?? 0
    const pagado = totalPagadoPorOrden.get(ordenId) ?? 0
    const exceso = pagado - costo
    if (exceso <= 0) continue
    const fechaPago = ultimaFechaPagoPorOrden.get(ordenId)
    if (!fechaPago) continue
    if (desdeISO && fechaPago < desdeISO) continue
    if (hastaISO && fechaPago > hastaISO) continue
    const info = ordenInfoPorOrden.get(ordenId) ?? null
    lista.push({
      id: `excesoprov_${ordenId}`,
      rawId: ordenId,
      fecha: fechaPago,
      categoria: 'exceso_proveedor',
      concepto: `Exceso pago proveedor · Orden #${info?.numero ?? '—'} (${info?.placa ?? '—'}) · ${info?.cliente ?? 'Cliente'}`,
      nombre: info?.cliente ?? null,
      codigo: info?.placa ?? null,
      monto: -exceso,
      metodoPagoId: null,
      metodoPago: null,
      cuentaEspecial: null,
      grupo: grupoOrden(info),
    })
  }

  for (const g of (gastos ?? []) as unknown as { id: string; descripcion: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null }[]) {
    lista.push({
      id: `gasto_${g.id}`,
      rawId: g.id,
      fecha: g.fecha,
      categoria: 'gasto',
      concepto: g.descripcion,
      nombre: g.descripcion,
      codigo: null,
      monto: -g.monto,
      metodoPagoId: g.metodo_pago_id,
      metodoPago: g.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: CATEGORIA_LABEL.gasto,
    })
  }

  for (const it of (insumos ?? []) as unknown as { id: string; descripcion: string; precio_venta: number; created_at: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; ordenes: { numero: number; placa: string; cliente: string; tipo_orden: string } | null }[]) {
    const ord = it.ordenes
    const concepto = `${it.descripcion} · ${ord?.cliente ?? 'Cliente'} · Orden #${ord?.numero ?? '—'} (${ord?.placa ?? '—'})`
    const esPortaPlacas = it.descripcion === 'Porta Placas'
    // Insumos de servicio técnico ya están en el pago total (ingreso_st); se
    // omiten para no duplicar. Porta Placas también aplica esta regla.
    if (ord?.tipo_orden === 'servicio') continue
    lista.push({
      id: `insumo_${it.id}`,
      rawId: it.id,
      fecha: it.created_at,
      categoria: esPortaPlacas ? 'porta_placas' : 'ingreso_insumo',
      concepto,
      nombre: ord?.cliente ?? null,
      codigo: ord?.placa ?? null,
      monto: it.precio_venta,
      metodoPagoId: it.metodo_pago_id,
      metodoPago: it.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: grupoOrden(ord),
    })
  }

  for (const a of (ajustes ?? []) as unknown as { id: string; descripcion: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; cuenta_especial: 'caja_fuerte' | null }[]) {
    lista.push({
      id: `ajuste_${a.id}`,
      rawId: a.id,
      fecha: a.fecha,
      categoria: 'ajuste',
      concepto: a.descripcion,
      nombre: a.descripcion,
      codigo: null,
      monto: a.monto,
      metodoPagoId: a.metodo_pago_id,
      metodoPago: a.cuenta_especial === 'caja_fuerte' ? 'Caja fuerte' : a.metodos_pago?.nombre ?? null,
      cuentaEspecial: a.cuenta_especial ?? null,
      grupo: CATEGORIA_LABEL.ajuste,
    })
  }

  for (const ig of (ingresos ?? []) as unknown as { id: string; descripcion: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null }[]) {
    lista.push({
      id: `ingreso_${ig.id}`,
      rawId: ig.id,
      fecha: ig.fecha,
      categoria: 'ingreso_manual',
      concepto: ig.descripcion,
      nombre: ig.descripcion,
      codigo: null,
      monto: ig.monto,
      metodoPagoId: ig.metodo_pago_id,
      metodoPago: ig.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: CATEGORIA_LABEL.ingreso_manual,
    })
  }

  for (const pc of (pagosColab ?? []) as unknown as { id: string; descripcion: string; monto: number; fecha: string; metodo_pago_id: string | null; metodos_pago: { nombre: string } | null; usuarios: { nombre: string } | null }[]) {
    lista.push({
      id: `pagocolab_${pc.id}`,
      rawId: pc.id,
      fecha: pc.fecha,
      categoria: 'pago_colaborador',
      concepto: `${pc.descripcion} · ${pc.usuarios?.nombre ?? 'Colaborador'}`,
      nombre: pc.usuarios?.nombre ?? null,
      codigo: null,
      monto: -pc.monto,
      metodoPagoId: pc.metodo_pago_id,
      metodoPago: pc.metodos_pago?.nombre ?? null,
      cuentaEspecial: null,
      grupo: CATEGORIA_LABEL.pago_colaborador,
    })
  }

  lista.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return lista
}
