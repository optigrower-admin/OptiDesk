'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { PeriodoFilter } from '@/components/dashboard/PeriodoFilter'
import { KpiCard } from '@/components/dashboard/KpiCard'
import {
  BarRankingChart, TimeSeriesChart, FunnelBars, WeekdayBarChart,
  type RankingDatum, type SerieDatum, type FunnelDatum, type WeekdayDatum,
} from '@/components/dashboard/charts'
import {
  calcularRango, calcularRangoAnterior, calcularVariacion, ymdLocal, PERIODO_LABEL,
  type PeriodoPreset,
} from '@/lib/dashboard/periodos'

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  tipo_servicio: string | null
  numeros_orden_uma: string[] | null
  gestiona_pago_proveedor: boolean
}

interface ItemOrdenRow {
  orden_id: string
  origen: string
  descripcion: string | null
  cantidad: number
  precio_venta: number
  costo: number | null
  repuesto_uma_id: string | null
  repuesto_externo_id: string | null
  estado_repuesto: string | null
}

type TipoItemKey = 'uma' | 'externo' | 'insumo' | 'porta_placas' | 'mano_obra'
const TIPO_ITEM_OPCIONES: { key: TipoItemKey; label: string }[] = [
  { key: 'uma', label: 'Repuestos UMA' },
  { key: 'externo', label: 'Externos / Propios' },
  { key: 'insumo', label: 'Insumos' },
  { key: 'porta_placas', label: 'Porta Placas' },
  { key: 'mano_obra', label: 'Mano de Obra' },
]
function categorizarItem(it: ItemOrdenRow): TipoItemKey {
  if (it.origen === 'insumo') return it.descripcion === 'Porta Placas' ? 'porta_placas' : 'insumo'
  if (it.origen === 'mano_obra') return 'mano_obra'
  if (it.origen === 'externo') return 'externo'
  return 'uma'
}

interface PagoProvRow { orden_id: string; monto: number }
interface SubcatRow { id: string; nombre: string }
type TipoServicioKey = 'uma' | 'otro'
type ChartUnidad = 'dias' | 'semanas' | 'meses'

const SELECT_ORDEN = 'id, numero, placa, cliente, cliente_id, moto_id, estado, estado_pago, valor_total, valor_abono, mecanico_id, categoria_servicio_id, subcategoria_servicio_id, subcategoria_servicio_ids, diagnostico, created_at, updated_at, fecha_finalizacion, tipo_servicio, numeros_orden_uma, gestiona_pago_proveedor'

const ESTADO_INFO: Record<string, { label: string; color: string }> = {
  programado:     { label: 'Programado',     color: '#f97316' },
  falta_revision: { label: 'Falta revisión', color: '#ef4444' },
  en_proceso:     { label: 'En proceso',     color: '#3b82f6' },
  pendiente:      { label: 'Pendiente',      color: '#f59e0b' },
  pagado:         { label: 'Pagado',         color: '#0d9488' },
  listo:          { label: 'Finalizado',     color: '#10b981' },
}
const ORDEN_ESTADOS = ['programado', 'falta_revision', 'en_proceso', 'pendiente', 'pagado', 'listo']
const ESTADOS_ABIERTOS = new Set(['falta_revision', 'en_proceso', 'pendiente', 'pagado'])
// (removed CHART_DEFAULTS — unit toggle and range are now independent controls)

function unicos<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter((v): v is T => v !== null && v !== undefined)))
}

function ymdKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function weekKey(d: Date) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = tmp.getUTCDay() || 7; tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const ys = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const wn = Math.ceil(((tmp.getTime() - ys.getTime()) / 86400000 + 1) / 7)
  return `S${wn}/${String(tmp.getUTCFullYear()).slice(2)}`
}
function monthKey(d: Date) {
  return d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
}
function monthOrder(k: string): number {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const [m, y] = k.split(' ')
  return Number(y) * 12 + months.indexOf(m.toLowerCase())
}

// ─── FilterDropdown (popup) ────────────────────────────────────────────────────

function FilterDropdown({ title, badge, children }: { title: string; badge?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
          open ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {title}
          {(badge ?? 0) > 0 && (
            <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
          )}
        </span>
        <svg className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[70] mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl p-3">
          {children}
        </div>
      )}
    </div>
  )
}

function CheckItem({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-1 cursor-pointer group">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
      <span className="text-xs text-gray-700 group-hover:text-gray-900 select-none truncate">{label}</span>
    </label>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardServicioTecnicoPage() {
  const { profile, loading: authLoading } = useAuth()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && profile && !['gerencia', 'dueno'].includes(profile.rol)) {
      router.replace('/admin/ordenes')
    }
  }, [authLoading, profile, router])

  const [activeTab, setActiveTab] = useState<'general' | 'ventas'>('general')

  // Period filter
  const [preset, setPreset] = useState<PeriodoPreset>('mes')
  const [desdeManual, setDesdeManual] = useState(ymdLocal(new Date()))
  const [hastaManual, setHastaManual] = useState(ymdLocal(new Date()))

  // Service-type filters
  const [tipoServicio, setTipoServicio] = useState<Set<TipoServicioKey>>(new Set(['uma', 'otro']))
  const [subtipoUMA, setSubtipoUMA] = useState<Set<string>>(new Set())
  const [tipoItem, setTipoItem] = useState<Set<TipoItemKey>>(new Set(TIPO_ITEM_OPCIONES.map((o) => o.key)))
  const [subcategorias, setSubcategorias] = useState<SubcatRow[]>([])
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Chart config — chartUnidad: how to group data points; chartRango*: how far back to fetch
  const [chartUnidad, setChartUnidad] = useState<ChartUnidad>('meses')
  const [chartRangoCantidad, setChartRangoCantidad] = useState(6)
  const [chartRangoUnidad, setChartRangoUnidad] = useState<ChartUnidad>('meses')

  // KPI data
  const [loading, setLoading] = useState(true)
  const [actual, setActual] = useState<OrdenRow[]>([])
  const [anterior, setAnterior] = useState<OrdenRow[]>([])
  const [items, setItems] = useState<ItemOrdenRow[]>([])
  const [pagosProveedor, setPagosProveedor] = useState<PagoProvRow[]>([])
  const [mapCategorias, setMapCategorias] = useState<Map<string, string>>(new Map())
  const [mapSubcategorias, setMapSubcategorias] = useState<Map<string, string>>(new Map())

  // Chart data (independent range)
  const [chartOrdenes, setChartOrdenes] = useState<OrdenRow[]>([])
  const [chartOrdenesAnt, setChartOrdenesAnt] = useState<OrdenRow[]>([])

  // Ranges
  const rango = useMemo(() => calcularRango(preset, desdeManual, hastaManual), [preset, desdeManual, hastaManual])
  const rangoAnterior = useMemo(() => calcularRangoAnterior(rango), [rango])

  const chartRango = useMemo(() => {
    const hasta = new Date(rango.hastaISO)
    let dias = chartRangoCantidad
    if (chartRangoUnidad === 'semanas') dias *= 7
    else if (chartRangoUnidad === 'meses') dias *= 30
    const desde = new Date(hasta); desde.setDate(hasta.getDate() - dias + 1); desde.setHours(0, 0, 0, 0)
    const hastaAnt = new Date(desde.getTime() - 1)
    const desdeAnt = new Date(hastaAnt.getTime() - dias * 86400000)
    return { desdeISO: desde.toISOString(), hastaISO: rango.hastaISO, desdeAntISO: desdeAnt.toISOString(), hastaAntISO: hastaAnt.toISOString() }
  }, [rango.hastaISO, chartRangoCantidad, chartRangoUnidad])

  // Load subcategorias once
  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('subcategorias_servicio').select('id, nombre').eq('tenant_id', profile.tenant_id).order('nombre')
      .then(({ data }) => setSubcategorias((data as SubcatRow[]) ?? []))
  }, [profile?.tenant_id])

  // Load KPI data
  useEffect(() => {
    if (!profile?.tenant_id) return
    let cancelado = false
    setLoading(true)
    const cargar = async () => {
      const tid = profile.tenant_id
      const [{ data: dA }, { data: dAnt }] = await Promise.all([
        supabase.from('ordenes').select(SELECT_ORDEN).eq('tenant_id', tid).eq('tipo_orden', 'servicio')
          .gte('created_at', rango.desdeISO).lte('created_at', rango.hastaISO),
        supabase.from('ordenes').select(SELECT_ORDEN).eq('tenant_id', tid).eq('tipo_orden', 'servicio')
          .gte('created_at', rangoAnterior.desdeISO).lte('created_at', rangoAnterior.hastaISO),
      ])
      const oA = (dA as OrdenRow[]) ?? []
      const oAnt = (dAnt as OrdenRow[]) ?? []
      const ids = oA.map((o) => o.id)

      const [{ data: dItems }, { data: dPP }] = await Promise.all([
        ids.length ? supabase.from('items_orden').select('orden_id, origen, descripcion, cantidad, precio_venta, costo, repuesto_uma_id, repuesto_externo_id, estado_repuesto').in('orden_id', ids)
          : Promise.resolve({ data: [] as ItemOrdenRow[] }),
        ids.length ? supabase.from('pagos_proveedor').select('orden_id, monto').in('orden_id', ids)
          : Promise.resolve({ data: [] as PagoProvRow[] }),
      ])

      const catIds = unicos([...oA, ...oAnt].map((o) => o.categoria_servicio_id))
      const subcatIds = unicos([...oA, ...oAnt].flatMap((o) =>
        o.subcategoria_servicio_ids?.length ? o.subcategoria_servicio_ids : (o.subcategoria_servicio_id ? [o.subcategoria_servicio_id] : [])
      ))
      const [{ data: catD }, { data: subcatD }] = await Promise.all([
        catIds.length ? supabase.from('categorias_servicio').select('id, nombre').in('id', catIds) : Promise.resolve({ data: [] }),
        subcatIds.length ? supabase.from('subcategorias_servicio').select('id, nombre').in('id', subcatIds) : Promise.resolve({ data: [] }),
      ])

      if (cancelado) return
      setActual(oA)
      setAnterior(oAnt)
      setItems((dItems as ItemOrdenRow[]) ?? [])
      setPagosProveedor((dPP as PagoProvRow[]) ?? [])
      setMapCategorias(new Map((catD as { id: string; nombre: string }[] ?? []).map((c) => [c.id, c.nombre])))
      setMapSubcategorias(new Map((subcatD as { id: string; nombre: string }[] ?? []).map((s) => [s.id, s.nombre])))
      setLoading(false)
    }
    cargar()
    return () => { cancelado = true }
  }, [profile?.tenant_id, rango.desdeISO, rango.hastaISO, rangoAnterior.desdeISO, rangoAnterior.hastaISO])

  // Load chart data (independent period)
  useEffect(() => {
    if (!profile?.tenant_id) return
    let cancelado = false
    const cargar = async () => {
      const tid = profile.tenant_id
      const [{ data: dC }, { data: dCA }] = await Promise.all([
        supabase.from('ordenes').select(SELECT_ORDEN).eq('tenant_id', tid).eq('tipo_orden', 'servicio')
          .gte('created_at', chartRango.desdeISO).lte('created_at', chartRango.hastaISO),
        supabase.from('ordenes').select(SELECT_ORDEN).eq('tenant_id', tid).eq('tipo_orden', 'servicio')
          .gte('created_at', chartRango.desdeAntISO).lte('created_at', chartRango.hastaAntISO),
      ])
      if (cancelado) return
      setChartOrdenes((dC as OrdenRow[]) ?? [])
      setChartOrdenesAnt((dCA as OrdenRow[]) ?? [])
    }
    cargar()
    return () => { cancelado = true }
  }, [profile?.tenant_id, chartRango.desdeISO, chartRango.hastaISO, chartRango.desdeAntISO, chartRango.hastaAntISO])

  // Client-side filtering
  const applyFilters = useCallback((rows: OrdenRow[]): OrdenRow[] => {
    let r = rows
    if (tipoServicio.size < 2) {
      const wantsUMA = tipoServicio.has('uma')
      r = r.filter((o) => wantsUMA ? o.tipo_servicio === 'uma' : o.tipo_servicio !== 'uma')
    }
    if (tipoServicio.has('uma') && subtipoUMA.size > 0) {
      r = r.filter((o) => {
        const ids = o.subcategoria_servicio_ids?.length
          ? o.subcategoria_servicio_ids
          : (o.subcategoria_servicio_id ? [o.subcategoria_servicio_id] : [])
        return ids.some((id) => subtipoUMA.has(id))
      })
    }
    return r
  }, [tipoServicio, subtipoUMA])

  const [oF, oAntF, cF, cAntF] = useMemo(
    () => [applyFilters(actual), applyFilters(anterior), applyFilters(chartOrdenes), applyFilters(chartOrdenesAnt)],
    [actual, anterior, chartOrdenes, chartOrdenesAnt, applyFilters]
  )

  const itemsF = useMemo(
    () => tipoItem.size === TIPO_ITEM_OPCIONES.length ? items : items.filter((it) => tipoItem.has(categorizarItem(it))),
    [items, tipoItem]
  )

  // Computed metrics
  const m = useMemo(() => {
    const sum = (rows: OrdenRow[]) => rows.reduce((s, o) => s + (o.valor_total ?? 0), 0)
    const totalFacturadoActual = sum(oF)
    const totalFacturadoAnterior = sum(oAntF)
    const totalOrdenesActual = oF.length
    const totalOrdenesAnterior = oAntF.length
    const ticketPromedioActual = totalOrdenesActual ? totalFacturadoActual / totalOrdenesActual : 0
    const ticketPromedioAnterior = totalOrdenesAnterior ? totalFacturadoAnterior / totalOrdenesAnterior : 0

    const pendientesActual = oF.filter((o) => o.estado_pago !== 'pagado')
    const carteraPendienteActual = pendientesActual.reduce((s, o) => s + ((o.valor_total ?? 0) - (o.valor_abono ?? 0)), 0)
    const carteraPendienteAnterior = oAntF.filter((o) => o.estado_pago !== 'pagado')
      .reduce((s, o) => s + ((o.valor_total ?? 0) - (o.valor_abono ?? 0)), 0)

    // CxP
    const costoExt = new Map<string, number>()
    for (const it of itemsF) {
      if (it.origen !== 'externo') continue
      costoExt.set(it.orden_id, (costoExt.get(it.orden_id) ?? 0) + (it.costo ?? 0) * it.cantidad)
    }
    const pagado = new Map<string, number>()
    for (const pp of pagosProveedor) pagado.set(pp.orden_id, (pagado.get(pp.orden_id) ?? 0) + pp.monto)
    let cxpProveedores = 0
    for (const o of oF) {
      if (!o.gestiona_pago_proveedor) continue
      cxpProveedores += Math.max(0, (costoExt.get(o.id) ?? 0) - (pagado.get(o.id) ?? 0))
    }

    // Operative
    const entradasAbiertas = oF.filter((o) => ESTADOS_ABIERTOS.has(o.estado)).length
    const finalizadasCount = oF.filter((o) => o.estado === 'listo').length
    const ordenesUMA = oF.filter((o) => o.tipo_servicio === 'uma')
    const ordenesUMAsinNumero = ordenesUMA.filter((o) => !o.numeros_orden_uma?.length).length

    // Funnel (current + anterior)
    const conteoEst = new Map<string, number>()
    for (const o of oF) conteoEst.set(o.estado, (conteoEst.get(o.estado) ?? 0) + 1)
    const conteoEstAnt = new Map<string, number>()
    for (const o of oAntF) conteoEstAnt.set(o.estado, (conteoEstAnt.get(o.estado) ?? 0) + 1)
    const funnelData: FunnelDatum[] = ORDEN_ESTADOS.map((e) => ({ label: ESTADO_INFO[e].label, value: conteoEst.get(e) ?? 0, color: ESTADO_INFO[e].color }))
    const funnelDataAnt: FunnelDatum[] = ORDEN_ESTADOS.map((e) => ({ label: ESTADO_INFO[e].label, value: conteoEstAnt.get(e) ?? 0, color: ESTADO_INFO[e].color }))

    // Time series (from chart data, grouped by chartUnidad)
    const keyFn: (d: Date) => string = chartUnidad === 'dias' ? ymdKey : chartUnidad === 'semanas' ? weekKey : monthKey
    const buildMap = (rows: OrdenRow[]) => {
      const map = new Map<string, { total: number; cant: number }>()
      for (const o of rows) {
        const k = keyFn(new Date(o.created_at)); const cur = map.get(k) ?? { total: 0, cant: 0 }
        cur.total += o.valor_total ?? 0; cur.cant += 1; map.set(k, cur)
      }
      return map
    }
    const porPeriodo = buildMap(cF)
    const porPeriodoAnt = buildMap(cAntF)

    let labels: string[]
    if (chartUnidad === 'dias') {
      const desde = new Date(chartRango.desdeISO); const hasta = new Date(chartRango.hastaISO)
      const n = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1)
      labels = Array.from({ length: n }, (_, i) => { const d = new Date(desde); d.setDate(desde.getDate() + i); return ymdKey(d) })
    } else if (chartUnidad === 'semanas') {
      const keys = new Set([...cF, ...cAntF].map((o) => weekKey(new Date(o.created_at))))
      labels = [...keys].sort()
    } else {
      const keys = new Set([...cF, ...cAntF].map((o) => monthKey(new Date(o.created_at))))
      labels = [...keys].sort((a, b) => monthOrder(a) - monthOrder(b))
    }
    const friendlyLabel = chartUnidad === 'dias'
      ? (k: string) => new Date(k + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
      : (k: string) => k

    const serieFacturacion: SerieDatum[] = labels.map((k) => ({ fecha: friendlyLabel(k), actual: porPeriodo.get(k)?.total ?? 0, anterior: porPeriodoAnt.get(k)?.total ?? 0 }))
    const serieCantidad: SerieDatum[] = labels.map((k) => ({ fecha: friendlyLabel(k), actual: porPeriodo.get(k)?.cant ?? 0, anterior: porPeriodoAnt.get(k)?.cant ?? 0 }))

    // Weekday breakdown (Mon=0 … Sun=6) — from KPI period data (oF / oAntF)
    const getDow = (d: Date) => { const day = d.getDay(); return day === 0 ? 6 : day - 1 }
    const wdFactAct = Array(7).fill(0); const wdCantAct = Array(7).fill(0)
    const wdFactAnt = Array(7).fill(0); const wdCantAnt = Array(7).fill(0)
    for (const o of oF) { const d = getDow(new Date(o.created_at)); wdFactAct[d] += o.valor_total ?? 0; wdCantAct[d]++ }
    for (const o of oAntF) { const d = getDow(new Date(o.created_at)); wdFactAnt[d] += o.valor_total ?? 0; wdCantAnt[d]++ }
    const weekdayFacturacion: WeekdayDatum[] = Array.from({ length: 7 }, (_, i) => ({ actual: wdFactAct[i], anterior: wdFactAnt[i] }))
    const weekdayCantidad: WeekdayDatum[] = Array.from({ length: 7 }, (_, i) => ({ actual: wdCantAct[i], anterior: wdCantAnt[i] }))

    // Servicios rankings (current + anterior for comparison)
    const labelServicio = (id: string) => mapSubcategorias.get(id) ?? mapCategorias.get(id) ?? 'Otro'
    const buildServicioMap = (rows: OrdenRow[]) => {
      const cant = new Map<string, number>(); const fact = new Map<string, number>()
      for (const o of rows) {
        const tagIds = o.subcategoria_servicio_ids?.length
          ? o.subcategoria_servicio_ids
          : (o.subcategoria_servicio_id ? [o.subcategoria_servicio_id] : (o.categoria_servicio_id ? [o.categoria_servicio_id] : []))
        if (!tagIds.length) continue
        const mpt = (o.valor_total ?? 0) / tagIds.length
        for (const t of tagIds) { cant.set(t, (cant.get(t) ?? 0) + 1); fact.set(t, (fact.get(t) ?? 0) + mpt) }
      }
      return { cant, fact }
    }
    const { cant: cantAct, fact: factAct } = buildServicioMap(oF)
    const { cant: cantAntM, fact: factAntM } = buildServicioMap(oAntF)

    const topServiciosCantidadRaw = [...cantAct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    const topServiciosCantidad: RankingDatum[] = topServiciosCantidadRaw.map(([id, v]) => ({ label: labelServicio(id), value: v }))
    const topServiciosCantidadAnt: RankingDatum[] = topServiciosCantidadRaw.map(([id]) => ({ label: labelServicio(id), value: cantAntM.get(id) ?? 0 }))

    const topServiciosFacturacionRaw = [...factAct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    const topServiciosFacturacion: RankingDatum[] = topServiciosFacturacionRaw.map(([id, v]) => ({ label: labelServicio(id), value: Math.round(v) }))
    const topServiciosFacturacionAnt: RankingDatum[] = topServiciosFacturacionRaw.map(([id]) => ({ label: labelServicio(id), value: Math.round(factAntM.get(id) ?? 0) }))

    // Cartera
    const ahora = Date.now()
    const vencidas = pendientesActual.filter((o) => (ahora - new Date(o.created_at).getTime()) / 86400000 > 7)
    const totalVencido = vencidas.reduce((s, o) => s + ((o.valor_total ?? 0) - (o.valor_abono ?? 0)), 0)
    const totalPagado = oF.filter((o) => o.estado_pago === 'pagado').reduce((s, o) => s + (o.valor_abono ?? 0), 0)
    const totalAbonado = oF.filter((o) => o.estado_pago === 'abono').reduce((s, o) => s + (o.valor_abono ?? 0), 0)

    // Alertas
    const ordenIdsConRepuestoPedido = new Set(itemsF.filter((i) => i.estado_repuesto === 'pedido').map((i) => i.orden_id))
    const alertas = [
      { key: 'sin_mecanico', label: 'Sin asignación de mecánico', count: oF.filter((o) => !o.mecanico_id && o.estado !== 'listo').length },
      { key: 'sin_diagnostico', label: 'Sin diagnóstico', count: oF.filter((o) => !o.diagnostico && o.estado === 'falta_revision').length },
      { key: 'esperando_repuestos', label: 'Esperando repuestos', count: oF.filter((o) => o.estado !== 'listo' && ordenIdsConRepuestoPedido.has(o.id)).length },
      { key: 'detenidas', label: 'Detenidas sin movimiento (+5 días)', count: oF.filter((o) => o.estado !== 'listo' && o.updated_at && (ahora - new Date(o.updated_at).getTime()) / 86400000 > 5).length },
      { key: 'vencidas', label: 'Cuentas vencidas (+7 días)', count: vencidas.length },
      { key: 'saldos', label: 'Saldos pendientes', count: pendientesActual.length },
    ]

    return {
      kpis: { totalFacturadoActual, totalFacturadoAnterior, totalOrdenesActual, totalOrdenesAnterior, ticketPromedioActual, ticketPromedioAnterior, carteraPendienteActual, carteraPendienteAnterior, cxpProveedores, entradasAbiertas, finalizadasCount, ordenesUMAsinNumero, ordenesUMATotal: ordenesUMA.length },
      funnelData, funnelDataAnt,
      serieFacturacion, serieCantidad,
      weekdayFacturacion, weekdayCantidad,
      topServiciosCantidad, topServiciosCantidadAnt,
      topServiciosFacturacion, topServiciosFacturacionAnt,
      cartera: { carteraPendienteActual, totalPagado, totalAbonado, totalVencido, pendientesCount: pendientesActual.length },
      alertas,
    }
  }, [oF, oAntF, cF, cAntF, itemsF, pagosProveedor, chartUnidad, chartRango, mapCategorias, mapSubcategorias])

  if (authLoading || !profile) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!['gerencia', 'dueno'].includes(profile.rol)) return null

  const v = (a: number, b: number) => calcularVariacion(a, b)
  const comparativoLabel = `vs ${PERIODO_LABEL[preset].toLowerCase()} anterior`

  const toggleTipo = (key: TipoServicioKey, checked: boolean) =>
    setTipoServicio((prev) => { const n = new Set(prev); checked ? n.add(key) : n.delete(key); return n })
  const toggleSubtipo = (id: string, checked: boolean) =>
    setSubtipoUMA((prev) => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n })
  const toggleTipoItem = (key: TipoItemKey, checked: boolean) =>
    setTipoItem((prev) => { const n = new Set(prev); checked ? n.add(key) : n.delete(key); return n })

  const filterPanel = (
    <div className="py-2 px-2 space-y-1">
      <FilterDropdown title="Período">
        <PeriodoFilter
          preset={preset} desdeManual={desdeManual} hastaManual={hastaManual}
          onChangePreset={setPreset} onChangeDesdeManual={setDesdeManual} onChangeHastaManual={setHastaManual}
        />
      </FilterDropdown>

      <FilterDropdown title="Tipo de servicio" badge={tipoServicio.size < 2 ? 1 : 0}>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Tipo de servicio</p>
        <CheckItem checked={tipoServicio.has('uma')} label="UMA" onChange={(c) => toggleTipo('uma', c)} />
        <CheckItem checked={tipoServicio.has('otro')} label="Externos / Otros" onChange={(c) => toggleTipo('otro', c)} />
      </FilterDropdown>

      {tipoServicio.has('uma') && subcategorias.length > 0 && (
        <FilterDropdown title="Subtipo UMA" badge={subtipoUMA.size > 0 ? subtipoUMA.size : 0}>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Subtipo UMA</p>
          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
            {subcategorias.map((s) => (
              <CheckItem key={s.id} checked={subtipoUMA.has(s.id)} label={s.nombre} onChange={(c) => toggleSubtipo(s.id, c)} />
            ))}
          </div>
          {subtipoUMA.size > 0 && (
            <button onClick={() => setSubtipoUMA(new Set())} className="mt-2 text-xs text-blue-600 hover:underline">
              Limpiar ({subtipoUMA.size})
            </button>
          )}
        </FilterDropdown>
      )}

      <FilterDropdown title="Tipo de repuesto / ítem" badge={TIPO_ITEM_OPCIONES.length - tipoItem.size}>
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Tipo de repuesto / ítem</p>
        {TIPO_ITEM_OPCIONES.map((o) => (
          <CheckItem key={o.key} checked={tipoItem.has(o.key)} label={o.label} onChange={(c) => toggleTipoItem(o.key, c)} />
        ))}
        <div className="flex items-center gap-3 mt-2">
          <button onClick={() => setTipoItem(new Set(TIPO_ITEM_OPCIONES.map((o) => o.key)))} className="text-xs text-blue-600 hover:underline">
            Todos
          </button>
          <button onClick={() => setTipoItem(new Set())} className="text-xs text-blue-600 hover:underline">
            Ninguno
          </button>
        </div>
      </FilterDropdown>
    </div>
  )

  return (
    <div className="bg-gray-50">
      {/* Header con tabs — sticky */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 pt-5 pb-0 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-gray-900">Dashboard Servicio Técnico</h1>
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="md:hidden flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 12h10M10 20h4" />
            </svg>
            Filtros
          </button>
        </div>
        <div className="flex gap-0">
          {(['general', 'ventas'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'general' ? 'General Servicio Técnico' : 'S.T. por Ventas'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex">
        {/* Left sidebar — sticky, only content scrolls */}
        <aside className="hidden md:block w-52 flex-shrink-0 bg-white border-r border-gray-200 sticky top-[89px] self-start h-[calc(100vh-89px)]">
          {filterPanel}
        </aside>

        {/* Mobile filter drawer */}
        {mobileFiltersOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileFiltersOpen(false)} />
            <aside className="relative w-72 max-w-[85vw] h-full bg-white flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="font-semibold text-sm">Filtros</span>
                <button onClick={() => setMobileFiltersOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1">{filterPanel}</div>
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6">
          {activeTab === 'ventas' ? (
            <div className="py-16 text-center text-gray-400">
              <p className="text-lg font-semibold">S.T. por Ventas</p>
              <p className="text-sm mt-1">Próximamente</p>
            </div>
          ) : loading ? (
            <div className="py-16 text-center text-gray-400">Cargando datos del período...</div>
          ) : (
            <div className="space-y-5 max-w-[1100px]">

              {/* KPIs Financieros */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">KPIs Financieros</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="Total facturado" valor={formatCOP(m.kpis.totalFacturadoActual)} variacion={v(m.kpis.totalFacturadoActual, m.kpis.totalFacturadoAnterior)} comparativoLabel={comparativoLabel} />
                  <KpiCard label="Ticket promedio" valor={formatCOP(m.kpis.ticketPromedioActual)} variacion={v(m.kpis.ticketPromedioActual, m.kpis.ticketPromedioAnterior)} comparativoLabel={comparativoLabel} />
                  <KpiCard label="Cuentas por Cobrar" valor={formatCOP(m.kpis.carteraPendienteActual)} variacion={v(m.kpis.carteraPendienteActual, m.kpis.carteraPendienteAnterior)} comparativoLabel={comparativoLabel} />
                  <KpiCard label="Cuentas por Pagar" valor={formatCOP(m.kpis.cxpProveedores)} />
                </div>
              </div>

              {/* KPIs Operativos */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">KPIs Operativos</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="Entradas a S.T." valor={String(m.kpis.totalOrdenesActual)} variacion={v(m.kpis.totalOrdenesActual, m.kpis.totalOrdenesAnterior)} comparativoLabel={comparativoLabel} />
                  <KpiCard label="Órdenes de servicio" valor={String(m.kpis.ordenesUMATotal)} sub={m.kpis.ordenesUMAsinNumero > 0 ? `${m.kpis.ordenesUMAsinNumero} sin # UMA` : undefined} />
                  <KpiCard label="Entradas finalizadas" valor={String(m.kpis.finalizadasCount)} />
                  <KpiCard label="Entradas abiertas" valor={String(m.kpis.entradasAbiertas)} />
                </div>
              </div>

              {/* Flujo operativo */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">Flujo operativo por etapa</h2>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-blue-500" /> Actual</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-gray-300" /> Período anterior</span>
                  </div>
                </div>
                <FunnelBars data={m.funnelData} dataAnterior={m.funnelDataAnt} />
              </div>

              {/* Tendencias — encuadrado */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-5">

                {/* Header con controles */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-gray-700">Tendencias</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Agrupación de puntos */}
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                      {(['dias', 'semanas', 'meses'] as ChartUnidad[]).map((u) => (
                        <button
                          key={u}
                          onClick={() => setChartUnidad(u)}
                          className={`px-3 py-1.5 transition-colors ${
                            chartUnidad === u ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {u === 'dias' ? 'Días' : u === 'semanas' ? 'Semanas' : 'Meses'}
                        </button>
                      ))}
                    </div>
                    {/* Rango a mostrar */}
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span>Últimos</span>
                      <input
                        type="number" min={1} max={72} value={chartRangoCantidad}
                        onChange={(e) => setChartRangoCantidad(Math.max(1, Math.min(72, Number(e.target.value))))}
                        className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-center text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <select
                        value={chartRangoUnidad}
                        onChange={(e) => setChartRangoUnidad(e.target.value as ChartUnidad)}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="dias">días</option>
                        <option value="semanas">semanas</option>
                        <option value="meses">meses</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Serie temporal */}
                <div className="grid lg:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Facturación</p>
                    <TimeSeriesChart data={m.serieFacturacion} formatValor={formatCOP} isMoney={true} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Cantidad de entradas</p>
                    <TimeSeriesChart data={m.serieCantidad} />
                  </div>
                </div>

                {/* Días de la semana */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Por día de la semana</p>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-blue-500" /> Actual</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-gray-300" /> Período anterior</span>
                    </div>
                  </div>
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Facturación</p>
                      <WeekdayBarChart data={m.weekdayFacturacion} color="#2563eb" formatValor={formatCOP} isMoney={true} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Cantidad de entradas</p>
                      <WeekdayBarChart data={m.weekdayCantidad} color="#0d9488" />
                    </div>
                  </div>
                </div>

              </div>

              {/* Rankings de servicios */}
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h2 className="text-sm font-semibold text-gray-700 mb-1">Servicios generados</h2>
                  <p className="text-xs text-gray-400 mb-3">Cantidad de entradas · Actual vs período anterior</p>
                  <BarRankingChart data={m.topServiciosCantidad} dataAnterior={m.topServiciosCantidadAnt} color="#3b82f6" />
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h2 className="text-sm font-semibold text-gray-700 mb-1">Servicios facturados</h2>
                  <p className="text-xs text-gray-400 mb-3">Facturación por servicio · Actual vs período anterior</p>
                  <BarRankingChart data={m.topServiciosFacturacion} dataAnterior={m.topServiciosFacturacionAnt} color="#0d9488" formatValor={formatCOP} />
                </div>
              </div>

              {/* Cartera */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Cartera y pagos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <KpiCard label="Pendiente por cobrar" valor={formatCOP(m.cartera.carteraPendienteActual)} />
                  <KpiCard label="Total pagado" valor={formatCOP(m.cartera.totalPagado)} />
                  <KpiCard label="Total abonado" valor={formatCOP(m.cartera.totalAbonado)} />
                  <KpiCard label="Total vencido" valor={formatCOP(m.cartera.totalVencido)} />
                  <KpiCard label="Órdenes pendientes" valor={String(m.cartera.pendientesCount)} />
                </div>
              </div>

              {/* Alertas */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Alertas operativas</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {m.alertas.map((a) => (
                    <button key={a.key} onClick={() => router.push('/admin/ordenes')}
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

            </div>
          )}
        </main>
      </div>
    </div>
  )
}
