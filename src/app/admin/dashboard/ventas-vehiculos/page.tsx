'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { PeriodoFilter } from '@/components/dashboard/PeriodoFilter'
import { KpiCard } from '@/components/dashboard/KpiCard'
import {
  BarRankingChart, TimeSeriesChart, WeekdayBarChart,
  type RankingDatum, type SerieDatum, type WeekdayDatum,
} from '@/components/dashboard/charts'
import {
  calcularRango, calcularRangoAnterior, calcularVariacion, ymdLocal, PERIODO_LABEL,
  type PeriodoPreset,
} from '@/lib/dashboard/periodos'
import { ETAPAS, ETAPA_MAP, ETAPA_ORDEN, esVenta, estadoSeguimiento, calcularPrecioMoto, type EtapaVenta } from '@/lib/ventas/pipeline'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Types ─────────────────────────────────────────────────────────────────────

type CampoFechaVenta = 'fecha_cierre' | 'fecha_matricula' | 'fecha_entrega'
const CAMPO_FECHA_VENTA_LABEL: Record<CampoFechaVenta, string> = {
  fecha_cierre: 'Fecha de venta / Carta negociación',
  fecha_matricula: 'Fecha de matrícula',
  fecha_entrega: 'Fecha de entrega',
}

interface ClienteRow {
  id: string
  nombre: string | null
  etapa_venta: EtapaVenta
  fecha_cierre: string | null
  fecha_matricula: string | null
  fecha_entrega: string | null
  created_at: string
  assigned_to: string | null
  proxima_accion_fecha: string | null
}
interface PagoRow { cliente_id: string; monto: number }
interface MotoInteresRow {
  cliente_id: string
  con_papeles: boolean
  con_tarjeta: boolean
  pignorada: boolean
  motos_catalogo: { referencia: string; precio: number; costo_documentos: number; costo_prenda: number } | null
}
interface CreditoRow { entidad_id: string; estado: string; updated_at: string; assigned_to: string | null }
interface EntidadRow { id: string; nombre: string }
interface Usuario { id: string; nombre: string }
type ChartUnidad = 'dias' | 'semanas' | 'meses'

const ETAPA_MIN_MATRICULADO = ETAPA_ORDEN['alistamiento']
const esMatriculado = (e: EtapaVenta) => (ETAPA_ORDEN[e] ?? -99) >= ETAPA_MIN_MATRICULADO

const ASESOR_COLORS = ['#2563eb', '#0d9488', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#16a34a', '#0891b2', '#ca8a04', '#9333ea']

function ymdKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function weekKey(d: Date) {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = tmp.getUTCDay() || 7; tmp.setUTCDate(tmp.getUTCDate() + 4 - day)
  const ys = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const wn = Math.ceil(((tmp.getTime() - ys.getTime()) / 86400000 + 1) / 7)
  return `S${wn}/${String(tmp.getUTCFullYear()).slice(2)}`
}
function monthKey(d: Date) { return d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }) }
function monthOrder(k: string): number {
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const [m, y] = k.split(' ')
  return Number(y) * 12 + months.indexOf(m.toLowerCase())
}
function getDow(d: Date) { const day = d.getDay(); return day === 0 ? 6 : day - 1 }

// ─── FilterDropdown (idéntico al de los otros dashboards) ─────────────────────

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
      <button onClick={() => setOpen(p => !p)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${open ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
        <span className="flex items-center gap-1.5">
          {title}
          {badge !== undefined && badge > 0 && (
            <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
          )}
        </span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="mt-1 mx-1 p-3 bg-white border border-gray-200 rounded-xl shadow-lg">{children}</div>}
    </div>
  )
}

function CheckItem({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-1 cursor-pointer group">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
      <span className="text-xs text-gray-700 group-hover:text-gray-900 select-none truncate">{label}</span>
    </label>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────────

export default function DashboardVentasVehiculosPage() {
  const { profile, loading: authLoading } = useAuth()
  const supabase = createClient()

  const rolNorm = (profile?.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'

  // Período (KPIs)
  const [preset, setPreset] = useState<PeriodoPreset>('mes')
  const [desdeManual, setDesdeManual] = useState(ymdLocal(new Date()))
  const [hastaManual, setHastaManual] = useState(ymdLocal(new Date()))
  const rango = useMemo(() => calcularRango(preset, desdeManual, hastaManual), [preset, desdeManual, hastaManual])
  const rangoAnterior = useMemo(() => calcularRangoAnterior(rango), [rango])
  // Qué fecha usar para decidir si una venta cayó en el período seleccionado
  const [campoFechaVenta, setCampoFechaVenta] = useState<CampoFechaVenta>('fecha_cierre')

  // Asesores
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [asesoresFiltro, setAsesoresFiltro] = useState<Set<string> | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Tendencias — unidad de agrupación y ventana independiente
  const [chartUnidad, setChartUnidad] = useState<ChartUnidad>('meses')
  const [chartRangoCantidad, setChartRangoCantidad] = useState(6)
  const [chartRangoUnidad, setChartRangoUnidad] = useState<ChartUnidad>('meses')
  const [chartUnidadNuevos, setChartUnidadNuevos] = useState<ChartUnidad>('meses')
  const [chartRangoCantidadNuevos, setChartRangoCantidadNuevos] = useState(6)
  const [chartRangoUnidadNuevos, setChartRangoUnidadNuevos] = useState<ChartUnidad>('meses')

  const chartRango = useMemo(() => {
    const hasta = new Date(rango.hastaISO)
    let dias = chartRangoCantidad
    if (chartRangoUnidad === 'semanas') dias *= 7; else if (chartRangoUnidad === 'meses') dias *= 30
    const desde = new Date(hasta); desde.setDate(hasta.getDate() - dias + 1); desde.setHours(0, 0, 0, 0)
    const hastaAnt = new Date(desde.getTime() - 1)
    const desdeAnt = new Date(hastaAnt.getTime() - dias * 86400000)
    return { desdeISO: desde.toISOString(), hastaISO: rango.hastaISO, desdeAntISO: desdeAnt.toISOString(), hastaAntISO: hastaAnt.toISOString() }
  }, [rango.hastaISO, chartRangoCantidad, chartRangoUnidad])

  const chartRangoNuevos = useMemo(() => {
    const hasta = new Date(rango.hastaISO)
    let dias = chartRangoCantidadNuevos
    if (chartRangoUnidadNuevos === 'semanas') dias *= 7; else if (chartRangoUnidadNuevos === 'meses') dias *= 30
    const desde = new Date(hasta); desde.setDate(hasta.getDate() - dias + 1); desde.setHours(0, 0, 0, 0)
    const hastaAnt = new Date(desde.getTime() - 1)
    const desdeAnt = new Date(hastaAnt.getTime() - dias * 86400000)
    return { desdeISO: desde.toISOString(), hastaISO: rango.hastaISO, desdeAntISO: desdeAnt.toISOString(), hastaAntISO: hastaAnt.toISOString() }
  }, [rango.hastaISO, chartRangoCantidadNuevos, chartRangoUnidadNuevos])

  // Datos
  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState<ClienteRow[]>([])
  const [pagos, setPagos] = useState<PagoRow[]>([])
  const [creditos, setCreditos] = useState<CreditoRow[]>([])
  const [entidades, setEntidades] = useState<EntidadRow[]>([])
  const [motosInteres, setMotosInteres] = useState<MotoInteresRow[]>([])
  const [recargoTarjeta, setRecargoTarjeta] = useState(5)

  useEffect(() => {
    if (!profile?.tenant_id) return
    if (!esGerencia) { setAsesoresFiltro(new Set([profile.id])); return }
    supabase.from('usuarios').select('id, nombre').eq('tenant_id', profile.tenant_id).eq('es_asesor', true).order('nombre')
      .then(({ data }) => setUsuarios((data as Usuario[]) ?? []))
  }, [profile?.tenant_id, esGerencia, profile?.id])

  useEffect(() => {
    if (!profile?.tenant_id) return
    let cancelado = false
    setLoading(true)
    const tid = profile.tenant_id
    const cargar = async () => {
      let q = supabase.from('clientes')
        .select('id, nombre, etapa_venta, fecha_cierre, fecha_matricula, fecha_entrega, created_at, assigned_to, proxima_accion_fecha')
        .eq('tenant_id', tid).eq('en_seguimiento_ventas', true).limit(5000)
      if (asesoresFiltro !== null) {
        const ids = [...asesoresFiltro].filter(id => id !== '__sin__')
        if (ids.length > 0) q = q.in('assigned_to', ids)
      }
      const [{ data: cl }, { data: pg }, { data: cr }, { data: ent }, { data: mi }, { data: tenant }] = await Promise.all([
        q,
        supabase.from('clientes_pagos').select('cliente_id, monto').eq('tenant_id', tid),
        supabase.from('clientes_credito_estudio')
          .select('entidad_id, estado, updated_at, clientes!inner(assigned_to)')
          .eq('tenant_id', tid).in('estado', ['aprobado', 'rechazado']),
        supabase.from('entidades_financieras').select('id, nombre').eq('tenant_id', tid).eq('activa', true).order('orden'),
        // clientes_motos_interes no tiene columna tenant_id (su RLS aísla por
        // tenant vía cliente_id → clientes.tenant_id) — filtrar aquí por
        // tenant_id haría fallar la consulta silenciosamente.
        supabase.from('clientes_motos_interes')
          .select('cliente_id, con_papeles, con_tarjeta, pignorada, motos_catalogo(referencia, precio, costo_documentos, costo_prenda)'),
        supabase.from('tenants').select('recargo_tarjeta_porcentaje').eq('id', tid).single(),
      ])
      if (cancelado) return
      setClientes((cl as ClienteRow[]) ?? [])
      setPagos((pg as PagoRow[]) ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCreditos(((cr ?? []) as any[]).map(c => ({
        entidad_id: c.entidad_id, estado: c.estado, updated_at: c.updated_at,
        assigned_to: (Array.isArray(c.clientes) ? c.clientes[0]?.assigned_to : c.clientes?.assigned_to) ?? null,
      })))
      setEntidades((ent as EntidadRow[]) ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMotosInteres(((mi ?? []) as any[]).map(x => ({
        cliente_id: x.cliente_id, con_papeles: x.con_papeles, con_tarjeta: x.con_tarjeta, pignorada: x.pignorada,
        motos_catalogo: Array.isArray(x.motos_catalogo) ? x.motos_catalogo[0] ?? null : x.motos_catalogo,
      })))
      setRecargoTarjeta(Number(tenant?.recargo_tarjeta_porcentaje ?? 5))
      setLoading(false)
    }
    cargar()
    return () => { cancelado = true }
  }, [profile?.tenant_id, asesoresFiltro])

  const creditosFiltrados = useMemo(
    () => asesoresFiltro === null ? creditos : creditos.filter(c => asesoresFiltro.has(c.assigned_to ?? '__sin__')),
    [creditos, asesoresFiltro]
  )

  const usuariosMap = useMemo(() => Object.fromEntries(usuarios.map(u => [u.id, u.nombre])), [usuarios])
  const pagosPorCliente = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pagos) m.set(p.cliente_id, (m.get(p.cliente_id) ?? 0) + (p.monto ?? 0))
    return m
  }, [pagos])
  // Valor real de venta por cliente — calculado igual que en la ficha del
  // cliente (calcularPrecioMoto sobre sus motos de interés), en vez de
  // depender del valor_estimado_venta guardado en `clientes` (que puede
  // quedar desactualizado si no se sincronizó tras un cambio).
  const valorPorCliente = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of motosInteres) {
      if (!s.motos_catalogo) continue
      const precio = calcularPrecioMoto(s.motos_catalogo, s.con_papeles, s.con_tarjeta, s.pignorada, recargoTarjeta)
      m.set(s.cliente_id, (m.get(s.cliente_id) ?? 0) + precio)
    }
    return m
  }, [motosInteres, recargoTarjeta])

  // ─── Métricas ────────────────────────────────────────────────────────────────
  const m = useMemo(() => {
    const enRango = (iso: string | null, r: { desdeISO: string; hastaISO: string }) =>
      !!iso && iso >= r.desdeISO && iso <= r.hastaISO

    const nuevosActual   = clientes.filter(c => enRango(c.created_at, rango))
    const nuevosAnterior = clientes.filter(c => enRango(c.created_at, rangoAnterior))

    const fechaVentaDe = (c: ClienteRow) => c[campoFechaVenta]
    const ventasActual   = clientes.filter(c => esVenta(c.etapa_venta) && enRango(fechaVentaDe(c), rango))
    const ventasAnterior = clientes.filter(c => esVenta(c.etapa_venta) && enRango(fechaVentaDe(c), rangoAnterior))

    const sumValor = (rows: ClienteRow[]) => rows.reduce((s, c) => s + (valorPorCliente.get(c.id) ?? 0), 0)
    const totalFacturadoActual = sumValor(ventasActual)
    const totalFacturadoAnterior = sumValor(ventasAnterior)
    const ticketPromedioActual = ventasActual.length ? totalFacturadoActual / ventasActual.length : 0
    const ticketPromedioAnterior = ventasAnterior.length ? totalFacturadoAnterior / ventasAnterior.length : 0

    // Lista de las ventas que se están contando en el período actual, según
    // el campo de fecha elegido en "Ver ventas según" — para poder revisar
    // exactamente cuáles clientes componen el Total facturado.
    const listaVentas = [...ventasActual]
      .sort((a, b) => (fechaVentaDe(b) ?? '').localeCompare(fechaVentaDe(a) ?? ''))
      .map(c => ({
        id: c.id, nombre: c.nombre ?? 'Sin nombre',
        etapaLabel: ETAPA_MAP[c.etapa_venta]?.label ?? c.etapa_venta,
        valor: valorPorCliente.get(c.id) ?? 0,
        fecha: fechaVentaDe(c),
      }))

    // Ventas del período agrupadas por modelo de moto (unidades vendidas)
    const idsVentas = new Set(ventasActual.map(c => c.id))
    const porMotoMap = new Map<string, number>()
    for (const mi of motosInteres) {
      if (!idsVentas.has(mi.cliente_id) || !mi.motos_catalogo) continue
      const ref = mi.motos_catalogo.referencia
      porMotoMap.set(ref, (porMotoMap.get(ref) ?? 0) + 1)
    }
    const ventasPorMoto: RankingDatum[] = [...porMotoMap.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)

    // Snapshot (no depende del período)
    const clientesVenta = clientes.filter(c => esVenta(c.etapa_venta))
    const totalMatriculado = clientes.filter(c => esMatriculado(c.etapa_venta)).length
    const cuentasPorCobrar = clientesVenta.reduce((s, c) => {
      const saldo = (valorPorCliente.get(c.id) ?? 0) - (pagosPorCliente.get(c.id) ?? 0)
      return s + Math.max(0, saldo)
    }, 0)
    const tasaConversion = clientes.length > 0 ? (clientesVenta.length / clientes.length) * 100 : 0

    // Crédito — actual vs anterior por updated_at
    const credActual   = creditosFiltrados.filter(c => enRango(c.updated_at, rango))
    const credAnterior = creditosFiltrados.filter(c => enRango(c.updated_at, rangoAnterior))
    const aprobActual = credActual.filter(c => c.estado === 'aprobado').length
    const totActual   = credActual.length
    const aprobAnt    = credAnterior.filter(c => c.estado === 'aprobado').length
    const totAnt      = credAnterior.length
    const tasaAprobacionActual   = totActual > 0 ? (aprobActual / totActual) * 100 : 0
    const tasaAprobacionAnterior = totAnt > 0 ? (aprobAnt / totAnt) * 100 : 0

    // Uso de crédito por entidad (todas las evaluaciones registradas, sin filtrar por período)
    const entidadMap = Object.fromEntries(entidades.map(e => [e.id, e.nombre]))
    const usoPorEntidad = new Map<string, number>()
    for (const c of creditosFiltrados) usoPorEntidad.set(c.entidad_id, (usoPorEntidad.get(c.entidad_id) ?? 0) + 1)
    const usoCreditoRanking: RankingDatum[] = [...usoPorEntidad.entries()]
      .map(([id, v]) => ({ label: entidadMap[id] ?? 'Desconocida', value: v }))
      .sort((a, b) => b.value - a.value)

    // Ranking de asesores por facturación (ventas del período actual)
    const factPorAsesor = new Map<string, number>()
    for (const c of ventasActual) {
      const k = c.assigned_to ?? '__sin__'
      factPorAsesor.set(k, (factPorAsesor.get(k) ?? 0) + (valorPorCliente.get(c.id) ?? 0))
    }
    const rankingAsesores: RankingDatum[] = [...factPorAsesor.entries()]
      .map(([id, v]) => ({ label: id === '__sin__' ? 'Sin asignar' : (usuariosMap[id] ?? 'Desconocido'), value: Math.round(v) }))
      .sort((a, b) => b.value - a.value).slice(0, 8)

    // Distribución por etapa (snapshot actual, apilado por asesor)
    const asesoresIds = [...new Set(clientes.map(c => c.assigned_to ?? '__sin__'))]
    const etapasVisibles = ETAPAS.filter(e => e.id !== 'perdido' && e.id !== 'proceso_finalizado')
    const distribucionEtapa = etapasVisibles.map(e => {
      const row: Record<string, string | number> = { etapa: e.label }
      for (const aid of asesoresIds) {
        row[aid] = clientes.filter(c => c.etapa_venta === e.id && (c.assigned_to ?? '__sin__') === aid).length
      }
      return row
    }).filter(row => asesoresIds.some(aid => Number(row[aid]) > 0))

    // ── Series de tiempo: Ventas (facturación + cantidad) ──
    const keyFn = (unidad: ChartUnidad) => unidad === 'dias' ? ymdKey : unidad === 'semanas' ? weekKey : monthKey
    function buildSeries(rows: ClienteRow[], rowsAnt: ClienteRow[], unidad: ChartUnidad, r: typeof chartRango, dateField: 'created_at' | CampoFechaVenta) {
      const kf = keyFn(unidad)
      const buildMap = (arr: ClienteRow[]) => {
        const map = new Map<string, { total: number; cant: number }>()
        for (const c of arr) {
          const iso = c[dateField]; if (!iso) continue
          const k = kf(new Date(iso)); const cur = map.get(k) ?? { total: 0, cant: 0 }
          cur.total += valorPorCliente.get(c.id) ?? 0; cur.cant += 1; map.set(k, cur)
        }
        return map
      }
      const porPeriodo = buildMap(rows)
      const porPeriodoAnt = buildMap(rowsAnt)
      let labels: string[]
      if (unidad === 'dias') {
        const desde = new Date(r.desdeISO); const hasta = new Date(r.hastaISO)
        const n = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1)
        labels = Array.from({ length: n }, (_, i) => { const d = new Date(desde); d.setDate(desde.getDate() + i); return ymdKey(d) })
      } else if (unidad === 'semanas') {
        labels = [...new Set([...rows, ...rowsAnt].map(c => c[dateField]).filter((v): v is string => !!v).map(v => weekKey(new Date(v))))].sort()
      } else {
        labels = [...new Set([...rows, ...rowsAnt].map(c => c[dateField]).filter((v): v is string => !!v).map(v => monthKey(new Date(v))))].sort((a, b) => monthOrder(a) - monthOrder(b))
      }
      const friendly = unidad === 'dias'
        ? (k: string) => new Date(k + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
        : (k: string) => k
      const serieFacturacion: SerieDatum[] = labels.map(k => ({ fecha: friendly(k), actual: porPeriodo.get(k)?.total ?? 0, anterior: porPeriodoAnt.get(k)?.total ?? 0 }))
      const serieCantidad: SerieDatum[] = labels.map(k => ({ fecha: friendly(k), actual: porPeriodo.get(k)?.cant ?? 0, anterior: porPeriodoAnt.get(k)?.cant ?? 0 }))
      return { serieFacturacion, serieCantidad }
    }

    const ventasEnRangoChart = clientes.filter(c => esVenta(c.etapa_venta) && enRango(fechaVentaDe(c), { desdeISO: chartRango.desdeISO, hastaISO: chartRango.hastaISO }))
    const ventasEnRangoChartAnt = clientes.filter(c => esVenta(c.etapa_venta) && enRango(fechaVentaDe(c), { desdeISO: chartRango.desdeAntISO, hastaISO: chartRango.hastaAntISO }))
    const { serieFacturacion: serieVentasFacturacion, serieCantidad: serieVentasCantidad } =
      buildSeries(ventasEnRangoChart, ventasEnRangoChartAnt, chartUnidad, chartRango, campoFechaVenta)

    const nuevosEnRangoChart = clientes.filter(c => enRango(c.created_at, { desdeISO: chartRangoNuevos.desdeISO, hastaISO: chartRangoNuevos.hastaISO }))
    const nuevosEnRangoChartAnt = clientes.filter(c => enRango(c.created_at, { desdeISO: chartRangoNuevos.desdeAntISO, hastaISO: chartRangoNuevos.hastaAntISO }))
    const { serieFacturacion: serieNuevosValor, serieCantidad: serieNuevosCantidad } =
      buildSeries(nuevosEnRangoChart, nuevosEnRangoChartAnt, chartUnidadNuevos, chartRangoNuevos, 'created_at')

    // Por día de la semana — a partir del período de KPIs (ventasActual/ventasAnterior y nuevosActual/nuevosAnterior)
    function buildWeekday(rows: ClienteRow[], rowsAnt: ClienteRow[], dateField: 'created_at' | CampoFechaVenta) {
      const wdValAct = Array(7).fill(0); const wdCantAct = Array(7).fill(0)
      const wdValAnt = Array(7).fill(0); const wdCantAnt = Array(7).fill(0)
      for (const c of rows) { const iso = c[dateField]; if (!iso) continue; const d = getDow(new Date(iso)); wdValAct[d] += valorPorCliente.get(c.id) ?? 0; wdCantAct[d]++ }
      for (const c of rowsAnt) { const iso = c[dateField]; if (!iso) continue; const d = getDow(new Date(iso)); wdValAnt[d] += valorPorCliente.get(c.id) ?? 0; wdCantAnt[d]++ }
      const weekdayValor: WeekdayDatum[] = Array.from({ length: 7 }, (_, i) => ({ actual: wdValAct[i], anterior: wdValAnt[i] }))
      const weekdayCantidad: WeekdayDatum[] = Array.from({ length: 7 }, (_, i) => ({ actual: wdCantAct[i], anterior: wdCantAnt[i] }))
      return { weekdayValor, weekdayCantidad }
    }
    const { weekdayValor: weekdayVentasFacturacion, weekdayCantidad: weekdayVentasCantidad } = buildWeekday(ventasActual, ventasAnterior, campoFechaVenta)
    const { weekdayValor: weekdayNuevosValor, weekdayCantidad: weekdayNuevosCantidad } = buildWeekday(nuevosActual, nuevosAnterior, 'created_at')

    // Clientes pendientes de gestionar: siguen activos (no perdidos ni
    // finalizados) y no tienen una próxima acción agendada, o ya venció —
    // sin importar el período seleccionado (es un pendiente de HOY).
    const pendientesGestion = clientes
      .filter(c => c.etapa_venta !== 'perdido' && c.etapa_venta !== 'proceso_finalizado')
      .map(c => ({ cliente: c, estado: estadoSeguimiento(c.proxima_accion_fecha) }))
      .filter((x): x is { cliente: ClienteRow; estado: 'vencido' | 'sin_accion' } => x.estado === 'vencido' || x.estado === 'sin_accion')
      .sort((a, b) => {
        if (a.estado !== b.estado) return a.estado === 'vencido' ? -1 : 1
        if (a.estado === 'vencido') return (a.cliente.proxima_accion_fecha ?? '').localeCompare(b.cliente.proxima_accion_fecha ?? '')
        return 0
      })

    return {
      kpis: {
        nuevosActual: nuevosActual.length, nuevosAnterior: nuevosAnterior.length,
        ventasActual: ventasActual.length, ventasAnterior: ventasAnterior.length,
        totalFacturadoActual, totalFacturadoAnterior,
        totalMatriculado, ticketPromedioActual, ticketPromedioAnterior,
        cuentasPorCobrar, tasaConversion, tasaAprobacionActual, tasaAprobacionAnterior,
      },
      usoCreditoRanking, rankingAsesores, distribucionEtapa, asesoresIds, pendientesGestion, listaVentas, ventasPorMoto,
      serieVentasFacturacion, serieVentasCantidad, weekdayVentasFacturacion, weekdayVentasCantidad,
      serieNuevosValor, serieNuevosCantidad, weekdayNuevosValor, weekdayNuevosCantidad,
    }
  }, [clientes, creditosFiltrados, entidades, pagosPorCliente, valorPorCliente, motosInteres, usuariosMap, rango, rangoAnterior, chartRango, chartUnidad, chartRangoNuevos, chartUnidadNuevos, campoFechaVenta])

  if (authLoading || !profile) return <div className="p-8 text-center text-gray-400">Cargando...</div>

  const v = (a: number, b: number) => calcularVariacion(a, b)
  const comparativoLabel = `vs ${PERIODO_LABEL[preset].toLowerCase()} anterior`

  const filterPanel = (
    <div className="py-2 px-2 space-y-1">
      <FilterDropdown title="Período">
        <PeriodoFilter preset={preset} desdeManual={desdeManual} hastaManual={hastaManual}
          onChangePreset={setPreset} onChangeDesdeManual={setDesdeManual} onChangeHastaManual={setHastaManual} />
      </FilterDropdown>

      <FilterDropdown title="Ver ventas según">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Qué fecha usar</p>
        <div className="space-y-1">
          {(['fecha_cierre', 'fecha_matricula', 'fecha_entrega'] as CampoFechaVenta[]).map(campo => (
            <label key={campo} className="flex items-center gap-2 py-1 cursor-pointer group">
              <input type="radio" name="campoFechaVenta" checked={campoFechaVenta === campo} onChange={() => setCampoFechaVenta(campo)}
                className="w-3.5 h-3.5 text-blue-600 focus:ring-blue-500 cursor-pointer" />
              <span className="text-xs text-gray-700 group-hover:text-gray-900 select-none">{CAMPO_FECHA_VENTA_LABEL[campo]}</span>
            </label>
          ))}
        </div>
      </FilterDropdown>

      {esGerencia && (
        <FilterDropdown title="Asesores" badge={asesoresFiltro?.size ?? 0}>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Asesores</p>
          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
            {usuarios.map(u => (
              <CheckItem key={u.id} checked={asesoresFiltro?.has(u.id) ?? false}
                onChange={c => setAsesoresFiltro(prev => {
                  const n = new Set(prev ?? [])
                  c ? n.add(u.id) : n.delete(u.id)
                  return n.size === 0 ? null : n
                })}
                label={u.nombre} />
            ))}
          </div>
          {asesoresFiltro && asesoresFiltro.size > 0 && (
            <button onClick={() => setAsesoresFiltro(null)} className="mt-2 text-xs text-blue-600 hover:underline">
              Limpiar ({asesoresFiltro.size})
            </button>
          )}
        </FilterDropdown>
      )}
    </div>
  )

  const UnidadSelector = ({ value, onChange }: { value: ChartUnidad; onChange: (u: ChartUnidad) => void }) => (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
      {(['dias', 'semanas', 'meses'] as ChartUnidad[]).map(u => (
        <button key={u} onClick={() => onChange(u)}
          className={`px-3 py-1.5 transition-colors ${value === u ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
          {u === 'dias' ? 'Días' : u === 'semanas' ? 'Semanas' : 'Meses'}
        </button>
      ))}
    </div>
  )

  const UltimosSelector = ({ cantidad, unidad, onCantidad, onUnidad }: {
    cantidad: number; unidad: ChartUnidad; onCantidad: (n: number) => void; onUnidad: (u: ChartUnidad) => void
  }) => (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <span>Últimos</span>
      <input type="number" min={1} max={72} value={cantidad}
        onChange={e => onCantidad(Math.max(1, Math.min(72, Number(e.target.value))))}
        className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-center text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500" />
      <select value={unidad} onChange={e => onUnidad(e.target.value as ChartUnidad)}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
        <option value="dias">días</option>
        <option value="semanas">semanas</option>
        <option value="meses">meses</option>
      </select>
    </div>
  )

  const LeyendaActualAnterior = () => (
    <div className="flex items-center gap-3 text-[10px] text-gray-400">
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-blue-500" /> Actual</span>
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded-sm bg-gray-300" /> Período anterior</span>
    </div>
  )

  return (
    <div className="bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 pt-5 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Ventas Vehículos</h1>
          <button onClick={() => setMobileFiltersOpen(true)}
            className="md:hidden flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 12h10M10 20h4" />
            </svg>
            Filtros
          </button>
        </div>
      </div>

      <div className="flex">
        <aside className="hidden md:block w-52 flex-shrink-0 bg-white border-r border-gray-200 sticky top-[73px] self-start h-[calc(100vh-73px)]">
          {filterPanel}
        </aside>

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

        <main className="flex-1 p-4 sm:p-6">
          {loading ? (
            <div className="py-16 text-center text-gray-400">Cargando datos del período...</div>
          ) : (
            <div className="space-y-5 max-w-[1100px]">

              {/* KPIs */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">KPIs</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="Contactos nuevos" valor={String(m.kpis.nuevosActual)} variacion={v(m.kpis.nuevosActual, m.kpis.nuevosAnterior)} comparativoLabel={comparativoLabel} />
                  <KpiCard label="Ventas realizadas" valor={String(m.kpis.ventasActual)} variacion={v(m.kpis.ventasActual, m.kpis.ventasAnterior)} comparativoLabel={comparativoLabel} />
                  <KpiCard label="Total facturado" valor={formatCOP(m.kpis.totalFacturadoActual)} variacion={v(m.kpis.totalFacturadoActual, m.kpis.totalFacturadoAnterior)} comparativoLabel={comparativoLabel} sub="Vendida en adelante" />
                  <KpiCard label="Total matriculado" valor={String(m.kpis.totalMatriculado)} sub="Alistamiento en adelante" />
                  <KpiCard label="Ticket promedio" valor={formatCOP(m.kpis.ticketPromedioActual)} variacion={v(m.kpis.ticketPromedioActual, m.kpis.ticketPromedioAnterior)} comparativoLabel={comparativoLabel} />
                  <KpiCard label="Cuentas por Cobrar" valor={formatCOP(m.kpis.cuentasPorCobrar)} sub="Vendida en adelante, menos abonos" />
                  <KpiCard label="Tasa de conversión" valor={m.kpis.tasaConversion.toFixed(1)} sufijo="%" sub="Vendidos / total en pipeline" />
                  <KpiCard label="Tasa aprobación créditos" valor={m.kpis.tasaAprobacionActual.toFixed(1)} sufijo="%" variacion={v(m.kpis.tasaAprobacionActual, m.kpis.tasaAprobacionAnterior)} comparativoLabel={comparativoLabel} />
                </div>
              </div>

              {/* Ventas del período — por cliente y por moto */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">Ventas de este período</h2>
                <p className="text-xs text-gray-400 mb-3">
                  Según {CAMPO_FECHA_VENTA_LABEL[campoFechaVenta].toLowerCase()} — estos {m.listaVentas.length} clientes componen el Total facturado y el Ticket promedio de arriba
                </p>
                <div className="grid lg:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Por cliente</p>
                    {m.listaVentas.length === 0 ? (
                      <div className="h-20 flex items-center justify-center text-sm text-gray-400">Sin ventas en este período</div>
                    ) : (
                      <div className="space-y-1.5 max-h-96 overflow-y-auto">
                        {m.listaVentas.map(v => (
                          <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{v.nombre}</p>
                              <p className="text-xs text-gray-400">
                                {v.etapaLabel}{v.fecha ? ` · ${new Date(v.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
                              </p>
                            </div>
                            <span className="text-sm font-bold text-emerald-700 flex-shrink-0">{formatCOP(v.valor)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Por moto (unidades)</p>
                    <BarRankingChart data={m.ventasPorMoto} color="#16a34a" />
                  </div>
                </div>
              </div>

              {/* Tendencia de Ventas */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-gray-700">Tendencia de Ventas</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <UnidadSelector value={chartUnidad} onChange={setChartUnidad} />
                    <UltimosSelector cantidad={chartRangoCantidad} unidad={chartRangoUnidad} onCantidad={setChartRangoCantidad} onUnidad={setChartRangoUnidad} />
                  </div>
                </div>
                <div className="grid lg:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Total facturado</p>
                    <TimeSeriesChart data={m.serieVentasFacturacion} formatValor={formatCOP} isMoney />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Unidades vendidas</p>
                    <TimeSeriesChart data={m.serieVentasCantidad} />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Por día de la semana</p>
                    <LeyendaActualAnterior />
                  </div>
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Facturación</p>
                      <WeekdayBarChart data={m.weekdayVentasFacturacion} color="#2563eb" formatValor={formatCOP} isMoney />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Cantidad de entradas</p>
                      <WeekdayBarChart data={m.weekdayVentasCantidad} color="#0d9488" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tendencia de Clientes Nuevos */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-gray-700">Tendencia de Clientes Nuevos</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <UnidadSelector value={chartUnidadNuevos} onChange={setChartUnidadNuevos} />
                    <UltimosSelector cantidad={chartRangoCantidadNuevos} unidad={chartRangoUnidadNuevos} onCantidad={setChartRangoCantidadNuevos} onUnidad={setChartRangoUnidadNuevos} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Cantidad de clientes nuevos</p>
                  <TimeSeriesChart data={m.serieNuevosCantidad} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Por día de la semana</p>
                    <LeyendaActualAnterior />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Cantidad</p>
                    <WeekdayBarChart data={m.weekdayNuevosCantidad} color="#db2777" />
                  </div>
                </div>
              </div>

              {/* Clientes pendientes de gestionar */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">Clientes pendientes de gestionar</h2>
                <p className="text-xs text-gray-400 mb-3">Sin próxima acción agendada, o ya vencida — no depende del período</p>
                {m.pendientesGestion.length === 0 ? (
                  <div className="h-24 flex items-center justify-center text-sm text-gray-400">Sin pendientes 🎉</div>
                ) : (
                  <div className="space-y-1.5 max-h-96 overflow-y-auto">
                    {m.pendientesGestion.slice(0, 30).map(({ cliente, estado }) => (
                      <div key={cliente.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{cliente.nombre ?? 'Sin nombre'}</p>
                          <p className="text-xs text-gray-400">{ETAPA_MAP[cliente.etapa_venta]?.label ?? cliente.etapa_venta}</p>
                        </div>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                          estado === 'vencido' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {estado === 'vencido' ? '🔴 Vencido' : '⚪ Sin acción'}
                        </span>
                      </div>
                    ))}
                    {m.pendientesGestion.length > 30 && (
                      <p className="text-xs text-gray-400 text-center pt-1">+{m.pendientesGestion.length - 30} más</p>
                    )}
                  </div>
                )}
              </div>

              {/* Uso de crédito por entidad + Ranking de asesores */}
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h2 className="text-sm font-semibold text-gray-700 mb-1">Uso de crédito por entidad</h2>
                  <p className="text-xs text-gray-400 mb-3">Cuántos clientes han pasado por estudio con cada entidad</p>
                  <BarRankingChart data={m.usoCreditoRanking} color="#0891b2" />
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <h2 className="text-sm font-semibold text-gray-700 mb-1">Ranking de asesores</h2>
                  <p className="text-xs text-gray-400 mb-3">Total facturado en el período actual</p>
                  <BarRankingChart data={m.rankingAsesores} color="#2563eb" formatValor={formatCOP} />
                </div>
              </div>

              {/* Distribución por etapa — horizontal, apilada por asesor */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-1">Distribución por etapa</h2>
                <p className="text-xs text-gray-400 mb-3">Clientes activos por etapa del pipeline, apilados por asesor</p>
                {m.distribucionEtapa.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-sm text-gray-400">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(m.distribucionEtapa.length * 34, 120)}>
                    <BarChart data={m.distribucionEtapa} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="etapa" width={150} tick={{ fontSize: 11, fill: '#374151' }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => usuariosMap[v] ?? (v === '__sin__' ? 'Sin asignar' : v)} />
                      {m.asesoresIds.map((aid, i) => (
                        <Bar key={aid} dataKey={aid} name={aid} stackId="etapa" fill={ASESOR_COLORS[i % ASESOR_COLORS.length]} radius={i === m.asesoresIds.length - 1 ? [0, 4, 4, 0] : undefined} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  )
}
