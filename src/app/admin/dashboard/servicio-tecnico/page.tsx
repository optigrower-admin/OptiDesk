'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { PeriodoFilter } from '@/components/dashboard/PeriodoFilter'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { DonutChart, BarRankingChart, TimeSeriesChart, FunnelBars, type DonutDatum, type RankingDatum, type SerieDatum, type FunnelDatum } from '@/components/dashboard/charts'
import {
  calcularRango, calcularRangoAnterior, calcularVariacion, ymdLocal, PERIODO_LABEL,
  type PeriodoPreset,
} from '@/lib/dashboard/periodos'

interface OrdenRow {
  id: string
  numero: number
  placa: string
  cliente: string
  cliente_id: string | null
  moto_id: string | null
  estado: string
  estado_pago: string
  valor_total: number
  valor_abono: number | null
  mecanico_id: string | null
  categoria_servicio_id: string | null
  subcategoria_servicio_id: string | null
  subcategoria_servicio_ids: string[] | null
  diagnostico: string | null
  created_at: string
  updated_at: string | null
  fecha_finalizacion: string | null
}

interface ItemOrdenRow {
  orden_id: string
  origen: string
  cantidad: number
  precio_venta: number
  repuesto_uma_id: string | null
  repuesto_externo_id: string | null
  estado_repuesto: string | null
}

const SELECT_ORDEN = 'id, numero, placa, cliente, cliente_id, moto_id, estado, estado_pago, valor_total, valor_abono, mecanico_id, categoria_servicio_id, subcategoria_servicio_id, subcategoria_servicio_ids, diagnostico, created_at, updated_at, fecha_finalizacion'

const ESTADO_INFO: Record<string, { label: string; color: string }> = {
  falta_revision: { label: 'Falta revisión', color: '#ef4444' },
  en_proceso:     { label: 'En proceso',     color: '#3b82f6' },
  pendiente:      { label: 'Pendiente',      color: '#f59e0b' },
  pagado:         { label: 'Pagado',         color: '#0d9488' },
  listo:          { label: 'Finalizado',     color: '#10b981' },
}
const ORDEN_ESTADOS = ['falta_revision', 'en_proceso', 'pendiente', 'pagado', 'listo']

function unicos<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter((v): v is T => v !== null && v !== undefined)))
}

function diffHoras(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 36e5
}

export default function DashboardServicioTecnicoPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && profile && !['gerencia', 'dueno'].includes(profile.rol)) {
      router.replace('/admin/ordenes')
    }
  }, [authLoading, profile, router])

  const [preset, setPreset] = useState<PeriodoPreset>('mes')
  const [desdeManual, setDesdeManual] = useState(ymdLocal(new Date()))
  const [hastaManual, setHastaManual] = useState(ymdLocal(new Date()))
  const [loading, setLoading] = useState(true)

  const [actual, setActual] = useState<OrdenRow[]>([])
  const [anterior, setAnterior] = useState<OrdenRow[]>([])
  const [items, setItems] = useState<ItemOrdenRow[]>([])
  const [finalizadasCount, setFinalizadasCount] = useState(0)
  const [mapUsuarios, setMapUsuarios] = useState<Map<string, string>>(new Map())
  const [mapMotos, setMapMotos] = useState<Map<string, string>>(new Map())
  const [mapCategorias, setMapCategorias] = useState<Map<string, string>>(new Map())
  const [mapSubcategorias, setMapSubcategorias] = useState<Map<string, string>>(new Map())
  const [mapRepUma, setMapRepUma] = useState<Map<string, string>>(new Map())
  const [mapRepExt, setMapRepExt] = useState<Map<string, string>>(new Map())

  const rango = useMemo(() => calcularRango(preset, desdeManual, hastaManual), [preset, desdeManual, hastaManual])
  const rangoAnterior = useMemo(() => calcularRangoAnterior(rango), [rango])

  useEffect(() => {
    if (!profile?.tenant_id) return
    let cancelado = false
    setLoading(true)

    const cargar = async () => {
      const tenantId = profile.tenant_id

      const [{ data: dataActual }, { data: dataAnterior }, { count: finCount }] = await Promise.all([
        supabase.from('ordenes').select(SELECT_ORDEN)
          .eq('tenant_id', tenantId).eq('tipo_orden', 'servicio')
          .gte('created_at', rango.desdeISO).lte('created_at', rango.hastaISO),
        supabase.from('ordenes').select(SELECT_ORDEN)
          .eq('tenant_id', tenantId).eq('tipo_orden', 'servicio')
          .gte('created_at', rangoAnterior.desdeISO).lte('created_at', rangoAnterior.hastaISO),
        supabase.from('ordenes').select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('tipo_orden', 'servicio').eq('estado', 'listo')
          .gte('fecha_finalizacion', rango.desdeISO).lte('fecha_finalizacion', rango.hastaISO),
      ])

      const ordenesActual = (dataActual as OrdenRow[]) ?? []
      const ordenesAnterior = (dataAnterior as OrdenRow[]) ?? []
      const ordenIds = ordenesActual.map((o) => o.id)

      const { data: dataItems } = ordenIds.length
        ? await supabase.from('items_orden')
            .select('orden_id, origen, cantidad, precio_venta, repuesto_uma_id, repuesto_externo_id, estado_repuesto')
            .in('orden_id', ordenIds)
        : { data: [] as ItemOrdenRow[] }
      const itemsActual = (dataItems as ItemOrdenRow[]) ?? []

      const mecanicoIds = unicos(ordenesActual.map((o) => o.mecanico_id))
      const motoIds = unicos(ordenesActual.map((o) => o.moto_id))
      const catIds = unicos(ordenesActual.map((o) => o.categoria_servicio_id))
      const subcatIds = unicos(ordenesActual.flatMap((o) =>
        o.subcategoria_servicio_ids?.length ? o.subcategoria_servicio_ids : (o.subcategoria_servicio_id ? [o.subcategoria_servicio_id] : [])
      ))
      const umaIds = unicos(itemsActual.filter((i) => i.origen === 'uma').map((i) => i.repuesto_uma_id))
      const extIds = unicos(itemsActual.filter((i) => i.origen === 'externo').map((i) => i.repuesto_externo_id))

      const [
        { data: usuariosData }, { data: motosData }, { data: catData }, { data: subcatData },
        { data: umaData }, { data: extData },
      ] = await Promise.all([
        mecanicoIds.length ? supabase.from('usuarios').select('id, nombre').in('id', mecanicoIds) : Promise.resolve({ data: [] }),
        motoIds.length ? supabase.from('motos').select('id, marca').in('id', motoIds) : Promise.resolve({ data: [] }),
        catIds.length ? supabase.from('categorias_servicio').select('id, nombre').in('id', catIds) : Promise.resolve({ data: [] }),
        subcatIds.length ? supabase.from('subcategorias_servicio').select('id, nombre').in('id', subcatIds) : Promise.resolve({ data: [] }),
        umaIds.length ? supabase.from('repuestos_uma').select('id, descripcion').in('id', umaIds) : Promise.resolve({ data: [] }),
        extIds.length ? supabase.from('repuestos_externos').select('id, nombre').in('id', extIds) : Promise.resolve({ data: [] }),
      ])

      if (cancelado) return
      setActual(ordenesActual)
      setAnterior(ordenesAnterior)
      setItems(itemsActual)
      setFinalizadasCount(finCount ?? 0)
      setMapUsuarios(new Map((usuariosData as { id: string; nombre: string }[] ?? []).map((u) => [u.id, u.nombre])))
      setMapMotos(new Map((motosData as { id: string; marca: string | null }[] ?? []).map((m) => [m.id, m.marca ?? 'Sin marca'])))
      setMapCategorias(new Map((catData as { id: string; nombre: string }[] ?? []).map((c) => [c.id, c.nombre])))
      setMapSubcategorias(new Map((subcatData as { id: string; nombre: string }[] ?? []).map((s) => [s.id, s.nombre])))
      setMapRepUma(new Map((umaData as { id: string; descripcion: string }[] ?? []).map((r) => [r.id, r.descripcion])))
      setMapRepExt(new Map((extData as { id: string; nombre: string }[] ?? []).map((r) => [r.id, r.nombre])))
      setLoading(false)
    }

    cargar()
    return () => { cancelado = true }
  }, [profile?.tenant_id, rango.desdeISO, rango.hastaISO, rangoAnterior.desdeISO, rangoAnterior.hastaISO])

  const m = useMemo(() => {
    const sum = (rows: OrdenRow[]) => rows.reduce((s, o) => s + (o.valor_total ?? 0), 0)
    const totalFacturadoActual = sum(actual)
    const totalFacturadoAnterior = sum(anterior)
    const totalOrdenesActual = actual.length
    const totalOrdenesAnterior = anterior.length
    const ticketPromedioActual = totalOrdenesActual ? totalFacturadoActual / totalOrdenesActual : 0
    const ticketPromedioAnterior = totalOrdenesAnterior ? totalFacturadoAnterior / totalOrdenesAnterior : 0

    const pendientesActual = actual.filter((o) => o.estado_pago !== 'pagado')
    const carteraPendienteActual = pendientesActual.reduce((s, o) => s + ((o.valor_total ?? 0) - (o.valor_abono ?? 0)), 0)
    const pendientesAnterior = anterior.filter((o) => o.estado_pago !== 'pagado')
    const carteraPendienteAnterior = pendientesAnterior.reduce((s, o) => s + ((o.valor_total ?? 0) - (o.valor_abono ?? 0)), 0)

    const motosActivasActual = actual.filter((o) => o.estado !== 'listo').length
    const motosActivasAnterior = anterior.filter((o) => o.estado !== 'listo').length

    const clientesUnicos = (rows: OrdenRow[]) => new Set(rows.map((o) => o.cliente_id ?? o.cliente)).size
    const clientesAtendidosActual = clientesUnicos(actual)
    const clientesAtendidosAnterior = clientesUnicos(anterior)

    // Distribución por estado (donut + funnel)
    const conteoEstado = new Map<string, number>()
    for (const o of actual) conteoEstado.set(o.estado, (conteoEstado.get(o.estado) ?? 0) + 1)
    const donutData: DonutDatum[] = ORDEN_ESTADOS
      .filter((e) => (conteoEstado.get(e) ?? 0) > 0)
      .map((e) => ({ label: ESTADO_INFO[e].label, value: conteoEstado.get(e) ?? 0, color: ESTADO_INFO[e].color }))
    const funnelData: FunnelDatum[] = ORDEN_ESTADOS.map((e) => ({
      label: ESTADO_INFO[e].label, value: conteoEstado.get(e) ?? 0, color: ESTADO_INFO[e].color,
    }))

    // Series temporales (facturación y cantidad por día, comparado por índice de día contra el período anterior)
    const porDiaActual = new Map<string, { total: number; cant: number }>()
    for (const o of actual) {
      const k = ymdLocal(o.created_at)
      const cur = porDiaActual.get(k) ?? { total: 0, cant: 0 }
      cur.total += o.valor_total ?? 0; cur.cant += 1
      porDiaActual.set(k, cur)
    }
    const porDiaAnterior = new Map<string, { total: number; cant: number }>()
    for (const o of anterior) {
      const k = ymdLocal(o.created_at)
      const cur = porDiaAnterior.get(k) ?? { total: 0, cant: 0 }
      cur.total += o.valor_total ?? 0; cur.cant += 1
      porDiaAnterior.set(k, cur)
    }
    const desdeD = new Date(rango.desdeISO)
    const desdeAntD = new Date(rangoAnterior.desdeISO)
    const numDias = Math.max(1, Math.round((new Date(rango.hastaISO).getTime() - desdeD.getTime()) / 86400000) + 1)
    const serieFacturacion: SerieDatum[] = []
    const serieCantidad: SerieDatum[] = []
    for (let i = 0; i < numDias; i++) {
      const dActual = new Date(desdeD); dActual.setDate(desdeD.getDate() + i)
      const dAnt = new Date(desdeAntD); dAnt.setDate(desdeAntD.getDate() + i)
      const label = dActual.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
      const vActual = porDiaActual.get(ymdLocal(dActual)) ?? { total: 0, cant: 0 }
      const vAnt = porDiaAnterior.get(ymdLocal(dAnt)) ?? { total: 0, cant: 0 }
      serieFacturacion.push({ fecha: label, actual: vActual.total, anterior: vAnt.total })
      serieCantidad.push({ fecha: label, actual: vActual.cant, anterior: vAnt.cant })
    }

    // Top servicios (cantidad y facturación) — por subcategoría, con fallback a categoría
    const cantidadServicio = new Map<string, number>()
    const facturacionServicio = new Map<string, number>()
    for (const o of actual) {
      const tagIds = o.subcategoria_servicio_ids?.length
        ? o.subcategoria_servicio_ids
        : (o.subcategoria_servicio_id ? [o.subcategoria_servicio_id] : (o.categoria_servicio_id ? [o.categoria_servicio_id] : []))
      if (!tagIds.length) continue
      const montoPorTag = (o.valor_total ?? 0) / tagIds.length
      for (const tag of tagIds) {
        cantidadServicio.set(tag, (cantidadServicio.get(tag) ?? 0) + 1)
        facturacionServicio.set(tag, (facturacionServicio.get(tag) ?? 0) + montoPorTag)
      }
    }
    const labelServicio = (id: string) => mapSubcategorias.get(id) ?? mapCategorias.get(id) ?? 'Otro'
    const topServiciosCantidad: RankingDatum[] = [...cantidadServicio.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([id, value]) => ({ label: labelServicio(id), value }))
    const topServiciosFacturacion: RankingDatum[] = [...facturacionServicio.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([id, value]) => ({ label: labelServicio(id), value: Math.round(value) }))

    // Top repuestos utilizados en servicio técnico
    const cantidadRepuesto = new Map<string, number>()
    for (const it of items) {
      if (it.origen !== 'uma' && it.origen !== 'externo') continue
      const id = it.origen === 'uma' ? it.repuesto_uma_id : it.repuesto_externo_id
      if (!id) continue
      const key = `${it.origen}:${id}`
      cantidadRepuesto.set(key, (cantidadRepuesto.get(key) ?? 0) + it.cantidad)
    }
    const labelRepuesto = (key: string) => {
      const [origen, id] = key.split(':')
      return origen === 'uma' ? (mapRepUma.get(id) ?? 'Repuesto UMA') : (mapRepExt.get(id) ?? 'Repuesto externo')
    }
    const topRepuestosUsados: RankingDatum[] = [...cantidadRepuesto.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([key, value]) => ({ label: labelRepuesto(key), value }))

    // Top clientes
    const clientesAgg = new Map<string, { count: number; total: number; nombre: string }>()
    for (const o of actual) {
      const key = o.cliente_id ?? o.cliente
      const cur = clientesAgg.get(key) ?? { count: 0, total: 0, nombre: o.cliente }
      cur.count += 1; cur.total += o.valor_total ?? 0
      clientesAgg.set(key, cur)
    }
    const topClientes: RankingDatum[] = [...clientesAgg.values()]
      .sort((a, b) => b.total - a.total).slice(0, 8)
      .map((c) => ({ label: c.nombre, value: Math.round(c.total), sub: `${c.count} orden${c.count !== 1 ? 'es' : ''}` }))

    // Top mecánicos
    const mecAgg = new Map<string, { count: number; total: number; horas: number[] }>()
    for (const o of actual) {
      if (!o.mecanico_id) continue
      const cur = mecAgg.get(o.mecanico_id) ?? { count: 0, total: 0, horas: [] }
      cur.count += 1; cur.total += o.valor_total ?? 0
      if (o.estado === 'listo' && o.fecha_finalizacion) cur.horas.push(diffHoras(o.created_at, o.fecha_finalizacion))
      mecAgg.set(o.mecanico_id, cur)
    }
    const topMecanicos: RankingDatum[] = [...mecAgg.entries()]
      .sort((a, b) => b[1].total - a[1].total).slice(0, 8)
      .map(([id, v]) => {
        const horasProm = v.horas.length ? v.horas.reduce((s, h) => s + h, 0) / v.horas.length : null
        const sub = horasProm !== null ? `${v.count} ord. · ${(horasProm / 24).toFixed(1)}d prom.` : `${v.count} ord.`
        return { label: mapUsuarios.get(id) ?? 'Sin nombre', value: Math.round(v.total), sub }
      })

    // Top marcas de motos
    const marcasAgg = new Map<string, number>()
    for (const o of actual) {
      if (!o.moto_id) continue
      const marca = mapMotos.get(o.moto_id)
      if (!marca || marca === 'Sin marca') continue
      marcasAgg.set(marca, (marcasAgg.get(marca) ?? 0) + 1)
    }
    const topMarcas: RankingDatum[] = [...marcasAgg.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([label, value]) => ({ label, value }))

    // Cartera y pagos
    const totalPagado = actual.filter((o) => o.estado_pago === 'pagado').reduce((s, o) => s + (o.valor_abono ?? 0), 0)
    const totalAbonado = actual.filter((o) => o.estado_pago === 'abono').reduce((s, o) => s + (o.valor_abono ?? 0), 0)
    const ahora = Date.now()
    const vencidas = pendientesActual.filter((o) => (ahora - new Date(o.created_at).getTime()) / 86400000 > 7)
    const totalVencido = vencidas.reduce((s, o) => s + ((o.valor_total ?? 0) - (o.valor_abono ?? 0)), 0)
    const valorPromedioPendiente = pendientesActual.length ? carteraPendienteActual / pendientesActual.length : 0

    // Alertas operativas
    const ordenIdsConRepuestoPedido = new Set(items.filter((i) => i.estado_repuesto === 'pedido').map((i) => i.orden_id))
    const alertas = [
      { key: 'sin_mecanico', label: 'Sin asignación de mecánico', count: actual.filter((o) => !o.mecanico_id && o.estado !== 'listo').length },
      { key: 'sin_diagnostico', label: 'Sin diagnóstico', count: actual.filter((o) => !o.diagnostico && o.estado === 'falta_revision').length },
      { key: 'esperando_repuestos', label: 'Esperando repuestos', count: actual.filter((o) => o.estado !== 'listo' && ordenIdsConRepuestoPedido.has(o.id)).length },
      { key: 'detenidas', label: 'Detenidas sin movimiento (+5 días)', count: actual.filter((o) => o.estado !== 'listo' && o.updated_at && (ahora - new Date(o.updated_at).getTime()) / 86400000 > 5).length },
      { key: 'vencidas', label: 'Cuentas vencidas (+7 días sin pagar)', count: vencidas.length },
      { key: 'saldos_pendientes', label: 'Órdenes con saldo pendiente', count: pendientesActual.length },
    ]

    // Resumen ejecutivo (reglas simples, sin IA)
    const facturacionVar = calcularVariacion(totalFacturadoActual, totalFacturadoAnterior)
    const bullets: string[] = []
    bullets.push(
      `Facturación de ${formatCOP(totalFacturadoActual)} en el período` +
      (facturacionVar.pct !== null ? `, ${facturacionVar.tendencia === 'up' ? 'un alza' : facturacionVar.tendencia === 'down' ? 'una baja' : 'sin cambio relevante'} de ${Math.abs(facturacionVar.pct).toFixed(1)}% vs el período anterior.` : '.')
    )
    if (topServiciosFacturacion[0]) {
      bullets.push(`El servicio que más factura es "${topServiciosFacturacion[0].label}" con ${formatCOP(topServiciosFacturacion[0].value)}.`)
    }
    if (topRepuestosUsados[0]) {
      bullets.push(`El repuesto con mayor movimiento es "${topRepuestosUsados[0].label}" (${topRepuestosUsados[0].value} unidades).`)
    }
    const cuelloBotella = ORDEN_ESTADOS.filter((e) => e !== 'listo')
      .map((e) => ({ e, count: conteoEstado.get(e) ?? 0 }))
      .sort((a, b) => b.count - a.count)[0]
    if (cuelloBotella && cuelloBotella.count > 0) {
      bullets.push(`La etapa con más órdenes acumuladas es "${ESTADO_INFO[cuelloBotella.e].label}" con ${cuelloBotella.count} orden${cuelloBotella.count !== 1 ? 'es' : ''}.`)
    }
    bullets.push(`Hay ${formatCOP(carteraPendienteActual)} pendientes por cobrar en ${pendientesActual.length} orden${pendientesActual.length !== 1 ? 'es' : ''}.`)
    const alertasActivas = alertas.filter((a) => a.count > 0)
    bullets.push(
      alertasActivas.length
        ? `Requieren atención: ${alertasActivas.map((a) => `${a.label.toLowerCase()} (${a.count})`).join(', ')}.`
        : 'No hay alertas operativas pendientes en este período.'
    )

    return {
      kpis: {
        totalFacturadoActual, totalFacturadoAnterior,
        totalOrdenesActual, totalOrdenesAnterior,
        ticketPromedioActual, ticketPromedioAnterior,
        carteraPendienteActual, carteraPendienteAnterior,
        motosActivasActual, motosActivasAnterior,
        clientesAtendidosActual, clientesAtendidosAnterior,
      },
      donutData, funnelData, serieFacturacion, serieCantidad,
      topServiciosCantidad, topServiciosFacturacion, topRepuestosUsados, topClientes, topMecanicos, topMarcas,
      cartera: { carteraPendienteActual, totalPagado, totalAbonado, totalVencido, pendientesCount: pendientesActual.length, valorPromedioPendiente },
      alertas,
      bullets,
    }
  }, [actual, anterior, items, mapUsuarios, mapMotos, mapCategorias, mapSubcategorias, mapRepUma, mapRepExt, rango, rangoAnterior])

  if (authLoading || !profile) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!['gerencia', 'dueno'].includes(profile.rol)) return null

  const v = (actualVal: number, anteriorVal: number) => calcularVariacion(actualVal, anteriorVal)
  const comparativoLabel = `vs ${PERIODO_LABEL[preset].toLowerCase()} anterior`

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Servicio Técnico</h1>
        <p className="text-sm text-gray-500">Vista ejecutiva de la operación de servicio técnico.</p>
      </div>

      <PeriodoFilter
        preset={preset} desdeManual={desdeManual} hastaManual={hastaManual}
        onChangePreset={setPreset} onChangeDesdeManual={setDesdeManual} onChangeHastaManual={setHastaManual}
      />

      {loading ? (
        <div className="py-16 text-center text-gray-400">Cargando datos del período...</div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <KpiCard label="Total facturado" valor={formatCOP(m.kpis.totalFacturadoActual)} variacion={v(m.kpis.totalFacturadoActual, m.kpis.totalFacturadoAnterior)} comparativoLabel={comparativoLabel} />
            <KpiCard label="Órdenes de servicio" valor={String(m.kpis.totalOrdenesActual)} variacion={v(m.kpis.totalOrdenesActual, m.kpis.totalOrdenesAnterior)} comparativoLabel={comparativoLabel} />
            <KpiCard label="Ticket promedio" valor={formatCOP(m.kpis.ticketPromedioActual)} variacion={v(m.kpis.ticketPromedioActual, m.kpis.ticketPromedioAnterior)} comparativoLabel={comparativoLabel} />
            <KpiCard label="Cartera pendiente" valor={formatCOP(m.kpis.carteraPendienteActual)} variacion={v(m.kpis.carteraPendienteActual, m.kpis.carteraPendienteAnterior)} comparativoLabel={comparativoLabel} />
            <KpiCard label="Motos activas en proceso" valor={String(m.kpis.motosActivasActual)} variacion={v(m.kpis.motosActivasActual, m.kpis.motosActivasAnterior)} comparativoLabel={comparativoLabel} />
            <KpiCard label="Órdenes finalizadas" valor={String(finalizadasCount)} />
            <KpiCard label="Clientes atendidos" valor={String(m.kpis.clientesAtendidosActual)} variacion={v(m.kpis.clientesAtendidosActual, m.kpis.clientesAtendidosAnterior)} comparativoLabel={comparativoLabel} />
          </div>

          {/* Estado operativo + flujo */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Estado operativo de órdenes</h2>
              <DonutChart data={m.donutData} />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Flujo operativo (órdenes por etapa)</h2>
              <FunnelBars data={m.funnelData} />
            </div>
          </div>

          {/* Series temporales */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Facturación por día</h2>
              <TimeSeriesChart data={m.serieFacturacion} formatValor={formatCOP} />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Cantidad de órdenes por día</h2>
              <TimeSeriesChart data={m.serieCantidad} />
            </div>
          </div>

          {/* Rankings */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Top servicios más solicitados</h2>
              <BarRankingChart data={m.topServiciosCantidad} color="#3b82f6" />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Top servicios que más facturan</h2>
              <BarRankingChart data={m.topServiciosFacturacion} color="#0d9488" formatValor={formatCOP} />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Top repuestos utilizados en servicio</h2>
              <BarRankingChart data={m.topRepuestosUsados} color="#f59e0b" />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Top marcas de motos</h2>
              <BarRankingChart data={m.topMarcas} color="#8b5cf6" />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Top clientes</h2>
              <BarRankingChart data={m.topClientes} color="#2563eb" formatValor={formatCOP} />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Top mecánicos</h2>
              <BarRankingChart data={m.topMecanicos} color="#0ea5e9" formatValor={formatCOP} />
            </div>
          </div>

          {/* Cartera y pagos */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Cartera y pagos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard label="Pendiente por cobrar" valor={formatCOP(m.cartera.carteraPendienteActual)} />
              <KpiCard label="Total pagado" valor={formatCOP(m.cartera.totalPagado)} />
              <KpiCard label="Total abonado" valor={formatCOP(m.cartera.totalAbonado)} />
              <KpiCard label="Total vencido" valor={formatCOP(m.cartera.totalVencido)} />
              <KpiCard label="Órdenes pendientes de pago" valor={String(m.cartera.pendientesCount)} />
              <KpiCard label="Promedio pendiente / orden" valor={formatCOP(m.cartera.valorPromedioPendiente)} />
            </div>
          </div>

          {/* Alertas operativas */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Alertas operativas</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {m.alertas.map((a) => (
                <button
                  key={a.key}
                  onClick={() => router.push('/admin/ordenes')}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    a.count > 0 ? 'bg-red-50 border-red-200 hover:bg-red-100' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                  }`}
                >
                  <p className={`text-xl font-bold ${a.count > 0 ? 'text-red-600' : 'text-gray-400'}`}>{a.count}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{a.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Resumen ejecutivo */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-blue-900 mb-2">Resumen ejecutivo</h2>
            <ul className="space-y-1.5">
              {m.bullets.map((b, i) => (
                <li key={i} className="text-sm text-blue-800 flex gap-2">
                  <span className="text-blue-400">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
