'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { PeriodoFilter } from '@/components/dashboard/PeriodoFilter'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { BarRankingChart, TimeSeriesChart, type RankingDatum, type SerieDatum } from '@/components/dashboard/charts'
import {
  calcularRango, calcularRangoAnterior, calcularVariacion, ymdLocal, PERIODO_LABEL,
  type PeriodoPreset,
} from '@/lib/dashboard/periodos'

interface OrdenRepRow {
  id: string
  cliente: string
  cliente_id: string | null
  estado: string
  estado_pago: string
  valor_total: number
  valor_abono: number | null
  created_at: string
  gestiona_pago_proveedor: boolean
}

interface ItemRepRow {
  orden_id: string
  origen: string
  cantidad: number
  precio_venta: number
  costo: number | null
  repuesto_uma_id: string | null
  repuesto_externo_id: string | null
}

interface PagoProvRow { orden_id: string; monto: number }

const SELECT_ORDEN = 'id, cliente, cliente_id, estado, estado_pago, valor_total, valor_abono, created_at, gestiona_pago_proveedor'

const KEYWORDS_LUBRICANTE = ['lubric', 'aceite', 'motor oil', 'oil', 'sintético', 'sintetico', 'mineral', 'transmision', 'transmisión', 'hidráulico', 'hidraulico']

function esLubricante(nombre: string): boolean {
  const lower = nombre.toLowerCase()
  return KEYWORDS_LUBRICANTE.some((k) => lower.includes(k))
}

function unicos<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter((v): v is T => v !== null && v !== undefined)))
}

export default function DashboardRepuestosPage() {
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

  const [actual, setActual] = useState<OrdenRepRow[]>([])
  const [anterior, setAnterior] = useState<OrdenRepRow[]>([])
  const [items, setItems] = useState<ItemRepRow[]>([])
  const [pagosProveedor, setPagosProveedor] = useState<PagoProvRow[]>([])
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

      const [{ data: dataActual }, { data: dataAnterior }] = await Promise.all([
        supabase.from('ordenes').select(SELECT_ORDEN)
          .eq('tenant_id', tenantId).eq('tipo_orden', 'venta_repuestos')
          .gte('created_at', rango.desdeISO).lte('created_at', rango.hastaISO),
        supabase.from('ordenes').select(SELECT_ORDEN)
          .eq('tenant_id', tenantId).eq('tipo_orden', 'venta_repuestos')
          .gte('created_at', rangoAnterior.desdeISO).lte('created_at', rangoAnterior.hastaISO),
      ])

      const ordenesActual = (dataActual as OrdenRepRow[]) ?? []
      const ordenesAnterior = (dataAnterior as OrdenRepRow[]) ?? []
      const ordenIds = ordenesActual.map((o) => o.id)

      const [{ data: dataItems }, { data: dataPagosProv }] = await Promise.all([
        ordenIds.length
          ? supabase.from('items_orden')
              .select('orden_id, origen, cantidad, precio_venta, costo, repuesto_uma_id, repuesto_externo_id')
              .in('orden_id', ordenIds)
          : Promise.resolve({ data: [] as ItemRepRow[] }),
        ordenIds.length
          ? supabase.from('pagos_proveedor').select('orden_id, monto').in('orden_id', ordenIds)
          : Promise.resolve({ data: [] as PagoProvRow[] }),
      ])
      const itemsActual = (dataItems as ItemRepRow[]) ?? []
      const pagosProvActual = (dataPagosProv as PagoProvRow[]) ?? []

      const umaIds = unicos(itemsActual.filter((i) => i.origen === 'uma').map((i) => i.repuesto_uma_id))
      const extIds = unicos(itemsActual.filter((i) => i.origen === 'externo').map((i) => i.repuesto_externo_id))

      const [{ data: umaData }, { data: extData }] = await Promise.all([
        umaIds.length ? supabase.from('repuestos_uma').select('id, descripcion').in('id', umaIds) : Promise.resolve({ data: [] }),
        extIds.length ? supabase.from('repuestos_externos').select('id, nombre').in('id', extIds) : Promise.resolve({ data: [] }),
      ])

      if (cancelado) return
      setActual(ordenesActual)
      setAnterior(ordenesAnterior)
      setItems(itemsActual)
      setPagosProveedor(pagosProvActual)
      setMapRepUma(new Map((umaData as { id: string; descripcion: string }[] ?? []).map((r) => [r.id, r.descripcion])))
      setMapRepExt(new Map((extData as { id: string; nombre: string }[] ?? []).map((r) => [r.id, r.nombre])))
      setLoading(false)
    }

    cargar()
    return () => { cancelado = true }
  }, [profile?.tenant_id, rango.desdeISO, rango.hastaISO, rangoAnterior.desdeISO, rangoAnterior.hastaISO])

  const m = useMemo(() => {
    const sum = (rows: OrdenRepRow[]) => rows.reduce((s, o) => s + (o.valor_total ?? 0), 0)
    const totalFacturadoActual = sum(actual)
    const totalFacturadoAnterior = sum(anterior)
    const totalOrdenesActual = actual.length
    const totalOrdenesAnterior = anterior.length
    const ticketPromedioActual = totalOrdenesActual ? totalFacturadoActual / totalOrdenesActual : 0
    const ticketPromedioAnterior = totalOrdenesAnterior ? totalFacturadoAnterior / totalOrdenesAnterior : 0

    const pendientesActual = actual.filter((o) => o.estado_pago !== 'pagado')
    const cxcActual = pendientesActual.reduce((s, o) => s + ((o.valor_total ?? 0) - (o.valor_abono ?? 0)), 0)
    const pendientesAnterior = anterior.filter((o) => o.estado_pago !== 'pagado')
    const cxcAnterior = pendientesAnterior.reduce((s, o) => s + ((o.valor_total ?? 0) - (o.valor_abono ?? 0)), 0)

    // CxP proveedores
    const costoExtPorOrden = new Map<string, number>()
    for (const it of items) {
      if (it.origen !== 'externo') continue
      costoExtPorOrden.set(it.orden_id, (costoExtPorOrden.get(it.orden_id) ?? 0) + (it.costo ?? 0) * it.cantidad)
    }
    const pagadoPorOrden = new Map<string, number>()
    for (const pp of pagosProveedor) {
      pagadoPorOrden.set(pp.orden_id, (pagadoPorOrden.get(pp.orden_id) ?? 0) + pp.monto)
    }
    let cxpProveedores = 0
    for (const o of actual) {
      if (!o.gestiona_pago_proveedor) continue
      const costo = costoExtPorOrden.get(o.id) ?? 0
      const pagado = pagadoPorOrden.get(o.id) ?? 0
      cxpProveedores += Math.max(0, costo - pagado)
    }

    // KPIs Operativos
    let cantRepuestosVendidos = 0
    let cantLubricantes = 0
    const cantidadPorItem = new Map<string, number>()
    const facturacionPorItem = new Map<string, number>()

    for (const it of items) {
      const nombre = it.origen === 'uma'
        ? (mapRepUma.get(it.repuesto_uma_id ?? '') ?? '')
        : (mapRepExt.get(it.repuesto_externo_id ?? '') ?? '')
      cantRepuestosVendidos += it.cantidad
      if (nombre && esLubricante(nombre)) cantLubricantes += it.cantidad

      const key = it.origen === 'uma' ? `uma:${it.repuesto_uma_id}` : `ext:${it.repuesto_externo_id}`
      cantidadPorItem.set(key, (cantidadPorItem.get(key) ?? 0) + it.cantidad)
      facturacionPorItem.set(key, (facturacionPorItem.get(key) ?? 0) + it.cantidad * it.precio_venta)
    }

    const labelItem = (key: string) => {
      const [origen, id] = key.split(':')
      return origen === 'uma' ? (mapRepUma.get(id) ?? 'Repuesto UMA') : (mapRepExt.get(id) ?? 'Repuesto externo')
    }

    const topRepuestosCantidad: RankingDatum[] = [...cantidadPorItem.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([key, value]) => ({ label: labelItem(key), value }))

    const topRepuestosFacturacion: RankingDatum[] = [...facturacionPorItem.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([key, value]) => ({ label: labelItem(key), value: Math.round(value) }))

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
      .map((c) => ({ label: c.nombre, value: Math.round(c.total), sub: `${c.count} venta${c.count !== 1 ? 's' : ''}` }))

    // Series temporales
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

    return {
      kpis: {
        totalFacturadoActual, totalFacturadoAnterior,
        totalOrdenesActual, totalOrdenesAnterior,
        ticketPromedioActual, ticketPromedioAnterior,
        cxcActual, cxcAnterior,
        cxpProveedores,
        cantRepuestosVendidos,
        cantLubricantes,
      },
      topRepuestosCantidad,
      topRepuestosFacturacion,
      topClientes,
      serieFacturacion,
      serieCantidad,
    }
  }, [actual, anterior, items, pagosProveedor, mapRepUma, mapRepExt, rango, rangoAnterior])

  if (authLoading || !profile) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!['gerencia', 'dueno'].includes(profile.rol)) return null

  const v = (actualVal: number, anteriorVal: number) => calcularVariacion(actualVal, anteriorVal)
  const comparativoLabel = `vs ${PERIODO_LABEL[preset].toLowerCase()} anterior`

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">General Repuestos</h1>
        <p className="text-sm text-gray-500">Vista ejecutiva de ventas directas de repuestos.</p>
      </div>

      <PeriodoFilter
        preset={preset} desdeManual={desdeManual} hastaManual={hastaManual}
        onChangePreset={setPreset} onChangeDesdeManual={setDesdeManual} onChangeHastaManual={setHastaManual}
      />

      {loading ? (
        <div className="py-16 text-center text-gray-400">Cargando datos del período...</div>
      ) : (
        <>
          {/* KPIs Financieros */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">KPIs Financieros</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total facturado" valor={formatCOP(m.kpis.totalFacturadoActual)} variacion={v(m.kpis.totalFacturadoActual, m.kpis.totalFacturadoAnterior)} comparativoLabel={comparativoLabel} />
              <KpiCard label="Ticket promedio" valor={formatCOP(m.kpis.ticketPromedioActual)} variacion={v(m.kpis.ticketPromedioActual, m.kpis.ticketPromedioAnterior)} comparativoLabel={comparativoLabel} />
              <KpiCard label="Cuentas por Cobrar" valor={formatCOP(m.kpis.cxcActual)} variacion={v(m.kpis.cxcActual, m.kpis.cxcAnterior)} comparativoLabel={comparativoLabel} />
              <KpiCard label="Cuentas por Pagar" valor={formatCOP(m.kpis.cxpProveedores)} />
            </div>
          </div>

          {/* KPIs Operativos */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">KPIs Operativos</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Ventas realizadas" valor={String(m.kpis.totalOrdenesActual)} variacion={v(m.kpis.totalOrdenesActual, m.kpis.totalOrdenesAnterior)} comparativoLabel={comparativoLabel} />
              <KpiCard label="Repuestos vendidos" valor={String(m.kpis.cantRepuestosVendidos)} sufijo="uds" />
              <KpiCard label="Aceites / Lubricantes" valor={String(m.kpis.cantLubricantes)} sufijo="uds" />
            </div>
          </div>

          {/* Series temporales */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Facturación por día</h2>
              <TimeSeriesChart data={m.serieFacturacion} formatValor={formatCOP} />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Cantidad de ventas por día</h2>
              <TimeSeriesChart data={m.serieCantidad} />
            </div>
          </div>

          {/* Rankings */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Repuestos más vendidos (cantidad)</h2>
              <BarRankingChart data={m.topRepuestosCantidad} color="#f59e0b" />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Repuestos que más facturan</h2>
              <BarRankingChart data={m.topRepuestosFacturacion} color="#0d9488" formatValor={formatCOP} />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Top clientes</h2>
              <BarRankingChart data={m.topClientes} color="#2563eb" formatValor={formatCOP} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
