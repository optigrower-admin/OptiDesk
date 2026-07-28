'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ETAPAS_ACTIVAS, ETAPA_MAP, ETAPAS_LEADS, ETAPAS_NECESITAN_PLACA, ETAPAS_NECESITAN_FACTURA,
  type EtapaVenta,
} from '@/lib/ventas/pipeline'
import { calcularRango } from '@/lib/dashboard/periodos'
import type { LeadData } from './LeadCard'
import FichaProspecto from './FichaProspecto'

/* ─── constantes ─────────────────────────────────────────────────── */
const EXCLUIR_RESUMEN: EtapaVenta[] = ['perdido', 'proceso_finalizado']
const ETAPAS_REVISION: EtapaVenta[] = ['entregada', 'primera_revision', 'segunda_revision', 'tercera_revision']

const REVISION_THRESHOLDS: Record<string, { alerta: number; riesgo: number; peligro: number }> = {
  entregada:        { alerta: 25,  riesgo: 30,  peligro: 33  },
  primera_revision: { alerta: 50,  riesgo: 60,  peligro: 70  },
  segunda_revision: { alerta: 80,  riesgo: 90,  peligro: 100 },
  tercera_revision: { alerta: 110, riesgo: 120, peligro: 130 },
}

/* ─── tipos ──────────────────────────────────────────────────────── */
interface Props {
  leads: LeadData[]
  tenantId: string
  usuarios: { id: string; nombre: string }[]
  asesoresFiltro: Set<string> | null // null = todos
  periodoRango: { desdeISO: string; hastaISO: string }
}
interface ActividadMap { [clienteId: string]: string }
interface Recordatorio {
  id: string; nota: string | null; fecha_recordatorio: string
  asignado_a: string | null; cliente_id: string | null
  clientes: { nombre: string | null; celular: string | null } | null
}
type LeadConDias = LeadData & { diasInactivo: number }
type NivelRevision = 'normal' | 'alerta' | 'riesgo' | 'peligro'
type ClientesNuevosPeriodo = 'dia' | 'semana' | 'mes'

/* ─── helpers ────────────────────────────────────────────────────── */
const diasDesde = (iso?: string) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0
const fmtFecha  = (iso: string)  => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })

function nivelRevision(etapa: string, dias: number): NivelRevision {
  const t = REVISION_THRESHOLDS[etapa]
  if (!t || dias < t.alerta) return 'normal'
  if (dias >= t.peligro) return 'peligro'
  if (dias >= t.riesgo)  return 'riesgo'
  return 'alerta'
}

function groupByAsesor(leads: LeadData[]): Record<string, LeadData[]> {
  const g: Record<string, LeadData[]> = {}
  for (const l of leads) {
    const k = l.assigned_to ?? '__sin__'
    if (!g[k]) g[k] = []
    g[k].push(l)
  }
  return g
}

function tasaColor(pct: number): string {
  return pct >= 70 ? '#16A34A' : pct >= 40 ? '#D97706' : '#DC2626'
}

/* ─── sub-componentes ─────────────────────────────────────────────── */
function MetricCard({ label, value, color = 'gray', sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50 border-blue-200 text-blue-800',
    amber:  'bg-amber-50 border-amber-200 text-amber-800',
    red:    'bg-red-50 border-red-200 text-red-800',
    green:  'bg-green-50 border-green-200 text-green-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    gray:   'bg-gray-50 border-gray-200 text-gray-800',
  }
  return (
    <div className={`rounded-xl border p-3 ${colors[color] ?? colors.gray}`}>
      <p className="text-xs font-medium opacity-70 leading-tight">{label}</p>
      <p className="text-2xl font-black mt-0.5">{value}</p>
      {sub && <p className="text-[11px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

/* Carta "Clientes nuevos" con su propio selector día/semana/mes */
function ClientesNuevosCard({ periodo, onChangePeriodo, count }: {
  periodo: ClientesNuevosPeriodo; onChangePeriodo: (p: ClientesNuevosPeriodo) => void; count: number | null
}) {
  return (
    <div className="rounded-xl border p-3 bg-blue-50 border-blue-200 text-blue-800">
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs font-medium opacity-70 leading-tight">Clientes nuevos</p>
        <div className="flex rounded-md overflow-hidden border border-blue-200 flex-shrink-0">
          {([['dia', 'D'], ['semana', 'S'], ['mes', 'M']] as [ClientesNuevosPeriodo, string][]).map(([p, l]) => (
            <button key={p} onClick={() => onChangePeriodo(p)}
              className={`text-[9px] font-bold px-1.5 py-0.5 transition-colors ${periodo === p ? 'bg-blue-600 text-white' : 'bg-white text-blue-500 hover:bg-blue-100'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="text-2xl font-black mt-0.5">{count === null ? '…' : count}</p>
      <p className="text-[11px] opacity-60 mt-0.5">{periodo === 'dia' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes'}</p>
    </div>
  )
}

function BarraHorizontal({ label, count, total, color, diasProm }: { label: string; count: number; total: number; color: string; diasProm?: number | null }) {
  const pct = total > 0 ? Math.max(4, Math.round((count / total) * 100)) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-36 truncate text-gray-600 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div className="h-4 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-6 text-right font-bold text-gray-700 flex-shrink-0">{count}</span>
      {diasProm != null && (
        <span className="w-16 text-right text-[10px] text-gray-400 flex-shrink-0" title="Días promedio en esta etapa">{diasProm.toFixed(1)}d prom</span>
      )}
    </div>
  )
}

function InactividadRow({ label, leads, color, bgColor, expandKey, expandidos, toggle, usuariosMap }: {
  label: string; leads: LeadConDias[]; color: string; bgColor: string
  expandKey: string; expandidos: Set<string>; toggle: (k: string) => void; usuariosMap: Record<string, string>
}) {
  if (leads.length === 0) return null
  const abierto = expandidos.has(expandKey)
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: color }}>
      <button onClick={() => toggle(expandKey)} className="w-full flex items-center justify-between px-4 py-2.5 text-left" style={{ background: bgColor }}>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="font-semibold text-sm" style={{ color }}>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-black text-lg" style={{ color }}>{leads.length}</span>
          <span className="text-xs" style={{ color }}>{abierto ? '▲' : '▼'}</span>
        </div>
      </button>
      {abierto && (
        <div className="divide-y divide-gray-100 bg-white">
          {leads.map(l => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{l.cliente?.nombre ?? 'Sin nombre'}</p>
                <p className="text-xs text-gray-400">{ETAPA_MAP[l.etapa_venta]?.label} · {l.assigned_to ? (usuariosMap[l.assigned_to] ?? 'Asesor') : 'Sin asignar'}</p>
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">{l.cliente?.celular ?? '—'}</span>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ background: color }}>{l.diasInactivo}d</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* Alerta de requisito — lista plana de clientes (nombre + asesor), sin nivel intermedio */
function AlertaRequisitoPanel({ alerta, expandidos, toggle, usuariosMap, onOpen }: {
  alerta: { id: string; icon: string; label: string; color: string; bg: string; border: string; leads: LeadData[] }
  expandidos: Set<string>; toggle: (k: string) => void; usuariosMap: Record<string, string>; onOpen: (id: string) => void
}) {
  if (alerta.leads.length === 0) return null
  const abierto = expandidos.has(alerta.id)
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: alerta.border }}>
      <button onClick={() => toggle(alerta.id)} className="w-full flex items-center justify-between px-4 py-2.5 text-left" style={{ background: alerta.bg }}>
        <div className="flex items-center gap-2">
          <span>{alerta.icon}</span>
          <span className="font-semibold text-sm" style={{ color: alerta.color }}>{alerta.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-black text-lg" style={{ color: alerta.color }}>{alerta.leads.length}</span>
          <span className="text-xs" style={{ color: alerta.color }}>{abierto ? '▲' : '▼'}</span>
        </div>
      </button>
      {abierto && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 p-3 bg-white">
          {alerta.leads.map(l => (
            <button key={l.id} onClick={() => onOpen(l.id)}
              className="text-left px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors">
              <p className="font-semibold text-gray-900 text-xs truncate">{l.cliente?.nombre ?? 'Sin nombre'}</p>
              <p className="text-[10px] text-gray-400">{l.assigned_to ? (usuariosMap[l.assigned_to] ?? 'Asesor') : 'Sin asignar'} · {l.cliente?.celular ?? 'Sin celular'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* Fila de revisión con semáforo */
function RevisionRow({ lead, dias, nivel, usuariosMap, onClick }: {
  lead: LeadData; dias: number; nivel: NivelRevision; usuariosMap: Record<string, string>; onClick: () => void
}) {
  const colorMap: Record<NivelRevision, { bg: string; text: string; label: string }> = {
    normal:  { bg: 'bg-gray-100',   text: 'text-gray-600',  label: '' },
    alerta:  { bg: 'bg-amber-100',  text: 'text-amber-800', label: '⚠ ALERTA' },
    riesgo:  { bg: 'bg-orange-100', text: 'text-orange-800',label: '🔶 RIESGO' },
    peligro: { bg: 'bg-red-100',    text: 'text-red-800',   label: '🚨 PELIGRO' },
  }
  const c = colorMap[nivel]
  return (
    <button onClick={onClick} className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg ${c.bg} hover:opacity-80 transition-opacity`}>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-xs truncate">{lead.cliente?.nombre ?? 'Sin nombre'}</p>
        <p className="text-[10px] text-gray-500">{lead.cliente?.celular ?? '—'} · {lead.assigned_to ? (usuariosMap[lead.assigned_to] ?? 'Asesor') : 'Sin asignar'}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className={`text-xs font-bold ${c.text}`}>{dias}d</span>
        {nivel !== 'normal' && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${c.bg} ${c.text} border border-current`}>{c.label}</span>}
      </div>
    </button>
  )
}

function RecordatorioRow({ r, tipo, usuariosMap }: { r: Recordatorio; tipo: 'vencido'|'hoy'|'proximo'; usuariosMap: Record<string, string> }) {
  const colores = { vencido: 'text-red-600', hoy: 'text-amber-600', proximo: 'text-blue-600' }
  const iconos  = { vencido: '⚠', hoy: '📌', proximo: '🔔' }
  return (
    <div className="px-4 py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-2">
        <span className={`text-xs font-bold flex-shrink-0 mt-0.5 ${colores[tipo]}`}>{iconos[tipo]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">{r.clientes?.nombre ?? 'Cliente'}{r.clientes?.celular ? ` · ${r.clientes.celular}` : ''}</p>
          <p className="text-[11px] text-gray-600 truncate">{r.nota ?? 'Sin nota'}</p>
          <p className={`text-[10px] ${colores[tipo]}`}>
            {fmtFecha(r.fecha_recordatorio)}
            {r.asignado_a && usuariosMap[r.asignado_a] && <span className="text-gray-400 ml-2">· {usuariosMap[r.asignado_a]}</span>}
          </p>
        </div>
      </div>
    </div>
  )
}

function AccionRow({ l, usuariosMap, onOpen, vencido }: { l: LeadData; usuariosMap: Record<string, string>; onOpen: () => void; vencido?: boolean }) {
  return (
    <button onClick={onOpen}
      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-2">
        <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${vencido ? 'bg-red-500' : 'bg-blue-400'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">{l.cliente?.nombre ?? 'Sin nombre'}</p>
          <p className="text-[11px] text-blue-700 truncate">📌 {l.proxima_accion}</p>
          <p className={`text-[10px] ${vencido ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
            {fmtFecha(l.proxima_accion_fecha!)}
            {l.assigned_to && <span className="ml-2">· {usuariosMap[l.assigned_to] ?? ''}</span>}
          </p>
        </div>
      </div>
    </button>
  )
}

/* ─── componente principal ────────────────────────────────────────── */
export default function VistaResumen({ leads, tenantId, usuarios, asesoresFiltro, periodoRango }: Props) {
  const supabase = createClient()
  const [actividad,     setActividad]     = useState<ActividadMap>({})
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [ordenesMap,    setOrdenesMap]    = useState<Record<string, number>>({}) // clienteId → count of service ordenes
  const [loading,       setLoading]       = useState(true)
  const [expandidos,    setExpandidos]    = useState<Set<string>>(new Set())
  const [fichaId,       setFichaId]       = useState<string | null>(null)
  const [leadsLocal,    setLeadsLocal]    = useState<LeadData[]>(leads)

  // Clientes nuevos (carta con su propio periodo)
  const [clientesNuevosPeriodo, setClientesNuevosPeriodo] = useState<ClientesNuevosPeriodo>('semana')
  const [clientesNuevosCount, setClientesNuevosCount] = useState<number | null>(null)

  // Tasa de aprobación de crédito
  const [estudiosCredito, setEstudiosCredito] = useState<{ entidad_id: string; estado: string; assignedTo: string | null }[]>([])
  const [entidades, setEntidades] = useState<{ id: string; nombre: string }[]>([])

  // Días promedio por etapa
  const [historialEtapas, setHistorialEtapas] = useState<{ etapa: string; dias: number; assignedTo: string | null }[]>([])

  const usuariosMap = useMemo(() => Object.fromEntries(usuarios.map(u => [u.id, u.nombre])), [usuarios])

  // Actualizar leads cuando el prop cambia
  useEffect(() => { setLeadsLocal(leads) }, [leads])

  /* ── Filtro por asesor(es) seleccionados en la barra lateral ── */
  const leadsFiltrados = useMemo(() => {
    if (asesoresFiltro === null) return leadsLocal
    return leadsLocal.filter(l => asesoresFiltro.has(l.assigned_to ?? '__sin__'))
  }, [leadsLocal, asesoresFiltro])

  /* ── Segmentación de leads ── */
  const leadsResumen  = useMemo(() => leadsFiltrados.filter(l => !(EXCLUIR_RESUMEN as string[]).includes(l.etapa_venta)), [leadsFiltrados])
  const leadsCore     = useMemo(() => leadsFiltrados.filter(l => (ETAPAS_ACTIVAS as string[]).includes(l.etapa_venta)), [leadsFiltrados])
  const leadsRevision = useMemo(() => leadsFiltrados.filter(l => (ETAPAS_REVISION as string[]).includes(l.etapa_venta)), [leadsFiltrados])

  /* ── Fetch datos externos (independientes del período) ── */
  useEffect(() => {
    if (!tenantId) return
    const clienteIds = leadsResumen.map(l => l.cliente?.id).filter((id): id is string => !!id)
    const revClientIds = leadsRevision
      .filter(l => ['segunda_revision', 'tercera_revision'].includes(l.etapa_venta))
      .map(l => l.cliente?.id).filter((id): id is string => !!id)

    Promise.all([
      clienteIds.length > 0
        ? supabase.from('clientes').select('id, updated_at').in('id', clienteIds)
        : Promise.resolve({ data: [] }),
      supabase.from('recordatorios')
        .select('id, nota, fecha_recordatorio, asignado_a, cliente_id, clientes(nombre, celular)')
        .eq('tenant_id', tenantId).eq('completado', false)
        .lte('fecha_recordatorio', new Date(Date.now() + 7 * 86400000).toISOString())
        .order('fecha_recordatorio').limit(200),
      revClientIds.length > 0
        ? supabase.from('ordenes')
            .select('cliente_id')
            .in('cliente_id', revClientIds)
            .eq('tipo_orden', 'servicio')
            .neq('estado', 'cancelada')
        : Promise.resolve({ data: [] }),
    ]).then(([{ data: cl }, { data: rec }, { data: ords }]) => {
      const mapAct: ActividadMap = {}
      for (const c of (cl ?? []) as { id: string; updated_at: string }[]) mapAct[c.id] = c.updated_at
      setActividad(mapAct)
      setRecordatorios((rec ?? []) as unknown as Recordatorio[])
      const mapOrds: Record<string, number> = {}
      for (const o of (ords ?? []) as { cliente_id: string }[]) {
        mapOrds[o.cliente_id] = (mapOrds[o.cliente_id] ?? 0) + 1
      }
      setOrdenesMap(mapOrds)
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  /* ── Clientes nuevos (según su propio toggle día/semana/mes) ── */
  useEffect(() => {
    if (!tenantId) return
    const presetMap = { dia: 'hoy', semana: 'semana', mes: 'mes' } as const
    const r = calcularRango(presetMap[clientesNuevosPeriodo])
    let q = supabase.from('clientes').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', r.desdeISO).lte('created_at', r.hastaISO)
    if (asesoresFiltro !== null) {
      const ids = [...asesoresFiltro].filter(id => id !== '__sin__')
      if (ids.length > 0) q = q.in('assigned_to', ids)
    }
    q.then(({ count }) => setClientesNuevosCount(count ?? 0))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, clientesNuevosPeriodo, asesoresFiltro])

  /* ── Tasa de aprobación de crédito y días promedio por etapa (según Período de la barra lateral) ── */
  useEffect(() => {
    if (!tenantId) return
    Promise.all([
      supabase.from('entidades_financieras').select('id, nombre').eq('tenant_id', tenantId).eq('activa', true).order('orden'),
      supabase.from('clientes_credito_estudio')
        .select('entidad_id, estado, clientes!inner(assigned_to)')
        .eq('tenant_id', tenantId).in('estado', ['aprobado', 'rechazado'])
        .gte('updated_at', periodoRango.desdeISO).lte('updated_at', periodoRango.hastaISO),
      supabase.from('historial_etapas_cliente')
        .select('etapa_anterior, dias_en_etapa, clientes!inner(assigned_to)')
        .eq('tenant_id', tenantId).not('etapa_anterior', 'is', null).not('dias_en_etapa', 'is', null)
        .gte('created_at', periodoRango.desdeISO).lte('created_at', periodoRango.hastaISO),
    ]).then(([{ data: ent }, { data: est }, { data: hist }]) => {
      setEntidades((ent ?? []) as { id: string; nombre: string }[])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setEstudiosCredito(((est ?? []) as any[]).map(e => ({
        entidad_id: e.entidad_id as string, estado: e.estado as string,
        assignedTo: (Array.isArray(e.clientes) ? e.clientes[0]?.assigned_to : e.clientes?.assigned_to) ?? null,
      })))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setHistorialEtapas(((hist ?? []) as any[]).map(h => ({
        etapa: h.etapa_anterior as string, dias: h.dias_en_etapa as number,
        assignedTo: (Array.isArray(h.clientes) ? h.clientes[0]?.assigned_to : h.clientes?.assigned_to) ?? null,
      })))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, periodoRango.desdeISO, periodoRango.hastaISO])

  const toggle = useCallback((k: string) => {
    setExpandidos(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }, [])

  /* ── Filtrar estudios/historial por asesor seleccionado ── */
  const estudiosFiltrados = useMemo(() =>
    asesoresFiltro === null ? estudiosCredito : estudiosCredito.filter(e => asesoresFiltro.has(e.assignedTo ?? '__sin__')),
    [estudiosCredito, asesoresFiltro])
  const historialFiltrado = useMemo(() =>
    asesoresFiltro === null ? historialEtapas : historialEtapas.filter(h => asesoresFiltro.has(h.assignedTo ?? '__sin__')),
    [historialEtapas, asesoresFiltro])

  /* ── Tasa de aprobación global y por entidad ── */
  const tasaAprobacion = useMemo(() => {
    const aprobados = estudiosFiltrados.filter(e => e.estado === 'aprobado').length
    const rechazados = estudiosFiltrados.filter(e => e.estado === 'rechazado').length
    const total = aprobados + rechazados
    const pct = total > 0 ? Math.round((aprobados / total) * 100) : null
    const porEntidad = entidades.map(e => {
      const rows = estudiosFiltrados.filter(x => x.entidad_id === e.id)
      const ap = rows.filter(x => x.estado === 'aprobado').length
      const re = rows.filter(x => x.estado === 'rechazado').length
      const t = ap + re
      return { entidad: e.nombre, aprobados: ap, rechazados: re, total: t, pct: t > 0 ? Math.round((ap / t) * 100) : null }
    }).filter(e => e.total > 0)
    return { aprobados, rechazados, total, pct, porEntidad }
  }, [estudiosFiltrados, entidades])

  /* ── Días promedio por etapa ── */
  const diasPromPorEtapa = useMemo(() => {
    const map: Record<string, number[]> = {}
    for (const h of historialFiltrado) {
      if (!map[h.etapa]) map[h.etapa] = []
      map[h.etapa].push(h.dias)
    }
    const out: Record<string, number> = {}
    for (const [etapa, arr] of Object.entries(map)) out[etapa] = arr.reduce((s, v) => s + v, 0) / arr.length
    return out
  }, [historialFiltrado])

  /* ── Inactividad leads core (excluye revisiones y perdido/finalizado) ── */
  const leadsConDias: LeadConDias[] = useMemo(() =>
    leadsCore.map(l => ({ ...l, diasInactivo: diasDesde(l.cliente?.id ? actividad[l.cliente.id] : undefined) })),
    [leadsCore, actividad])

  const inactivos = useMemo(() => ({
    d3:  leadsConDias.filter(l => l.diasInactivo >= 3),
    d5:  leadsConDias.filter(l => l.diasInactivo >= 5),
    d7:  leadsConDias.filter(l => l.diasInactivo >= 7),
    d14: leadsConDias.filter(l => l.diasInactivo >= 14),
  }), [leadsConDias])

  /* ── Revisiones con días e inactividad ── */
  const revisionesConDias = useMemo(() =>
    leadsRevision.map(l => ({
      ...l,
      diasInactivo: diasDesde(l.cliente?.id ? actividad[l.cliente.id] : undefined),
      nivel: nivelRevision(l.etapa_venta, diasDesde(l.cliente?.id ? actividad[l.cliente.id] : undefined)),
    })),
    [leadsRevision, actividad])

  const revisionesConAlerta = useMemo(() =>
    revisionesConDias.filter(r => r.nivel !== 'normal'), [revisionesConDias])

  /* ── Alertas de requisitos — lista plana de clientes ── */
  const alertasRequisitos = useMemo(() => {
    const sinCelular = leadsResumen.filter(l =>
      (ETAPAS_LEADS as string[]).includes(l.etapa_venta) && !l.cliente?.celular)
    const sinPlaca = leadsResumen.filter(l =>
      (ETAPAS_NECESITAN_PLACA as string[]).includes(l.etapa_venta) && l.tienePlaca === false)
    const sinFactura = leadsResumen.filter(l =>
      (ETAPAS_NECESITAN_FACTURA as string[]).includes(l.etapa_venta) && !l.numero_factura)
    const aprobacionPendiente = leadsResumen.filter(l =>
      l.etapa_venta === 'aprobado_matricula' && l.estadoAprobacionMatricula === 'pendiente')
    const faltaAlistamiento = leadsResumen.filter(l =>
      (l.etapa_venta === 'espera_entrega' || l.etapa_venta === 'entregada') && l.tieneAlistamiento === false)
    const sinPrimeraRev = leadsRevision.filter(l =>
      l.etapa_venta === 'segunda_revision' && l.cliente?.id && (ordenesMap[l.cliente.id] ?? 0) === 0)
    const sinSegundaRev = leadsRevision.filter(l =>
      l.etapa_venta === 'tercera_revision' && l.cliente?.id && (ordenesMap[l.cliente.id] ?? 0) < 2)

    return [
      { id: 'sin_celular',      icon: '📵', label: 'Sin número de celular',              color: '#EA580C', bg: '#FFF7ED', border: '#FDBA74', leads: sinCelular      },
      { id: 'sin_placa',        icon: '🏍️', label: 'Sin placa asignada',                 color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5', leads: sinPlaca        },
      { id: 'sin_factura',      icon: '🧾', label: 'Sin número de factura',               color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5', leads: sinFactura      },
      { id: 'aprobacion',       icon: '⏳', label: 'Aprobación matrícula pendiente',      color: '#D97706', bg: '#FFFBEB', border: '#FCD34D', leads: aprobacionPendiente },
      { id: 'alistamiento',     icon: '🔧', label: 'Falta alistamiento',                 color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5', leads: faltaAlistamiento },
      { id: 'sin_primera_rev',  icon: '📋', label: '2da Rev. sin entrada de 1era Rev. ST', color: '#7C3AED', bg: '#F5F3FF', border: '#C4B5FD', leads: sinPrimeraRev  },
      { id: 'sin_segunda_rev',  icon: '📋', label: '3era Rev. sin entrada de 2da Rev. ST', color: '#7C3AED', bg: '#F5F3FF', border: '#C4B5FD', leads: sinSegundaRev  },
    ].filter(a => a.leads.length > 0)
  }, [leadsResumen, leadsRevision, ordenesMap])

  /* ── Métricas globales ── */
  const segVencido        = leadsResumen.filter(l => l.proxima_accion_fecha && new Date(l.proxima_accion_fecha) < new Date())
  const sinSeguimiento    = leadsResumen.filter(l => !l.proxima_accion_fecha)
  const ahora             = new Date()
  const hoyStr            = ahora.toDateString()
  const finHoy             = new Date(ahora); finHoy.setHours(23, 59, 59, 999)
  const recVencidos       = recordatorios.filter(r => new Date(r.fecha_recordatorio) < ahora)
  const recHoy            = recordatorios.filter(r => { const d = new Date(r.fecha_recordatorio); return d.toDateString() === hoyStr && d >= ahora })
  const recProximos       = recordatorios.filter(r => { const d = new Date(r.fecha_recordatorio); return d > ahora && d.toDateString() !== hoyStr })
  const totalAlertas      = alertasRequisitos.reduce((s, a) => s + a.leads.length, 0)

  /* ── Por etapa (solo leadsResumen) ── */
  const porEtapa = useMemo(() => {
    const etapasConLeads = new Set(leadsResumen.map(l => l.etapa_venta))
    return Array.from(etapasConLeads).map(etapa => {
      const enEtapa = leadsResumen.filter(l => l.etapa_venta === etapa)
      const porAsesor: Record<string, LeadData[]> = {}
      for (const l of enEtapa) {
        const k = l.assigned_to ?? '__sin__'
        if (!porAsesor[k]) porAsesor[k] = []
        porAsesor[k].push(l)
      }
      return { etapa, config: ETAPA_MAP[etapa], total: enEtapa.length, porAsesor }
    })
  }, [leadsResumen])

  const asesoresActivos = useMemo(() => {
    const ids = new Set(leadsResumen.map(l => l.assigned_to ?? '__sin__'))
    return [
      ...usuarios.filter(u => ids.has(u.id)),
      ...(ids.has('__sin__') ? [{ id: '__sin__', nombre: 'Sin asignar' }] : []),
    ]
  }, [leadsResumen, usuarios])

  const fichaLead = fichaId ? leadsLocal.find(l => l.id === fichaId) ?? null : null

  const handleLeadUpdate = useCallback((id: string, updates: {
    proxima_accion?: string | null; proxima_accion_fecha?: string | null
    nombre?: string; celular?: string | null; placa?: string | null
    numero_factura?: string | null; assigned_to?: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }) => {
    setLeadsLocal(prev => prev.map(l => {
      if (l.id !== id) return l
      const cp: Record<string, unknown> = {}
      if (updates.nombre  !== undefined) cp.nombre  = updates.nombre
      if (updates.celular !== undefined) cp.celular = updates.celular
      if (updates.placa   !== undefined) cp.placa   = updates.placa
      return {
        ...l,
        ...(updates.proxima_accion       !== undefined ? { proxima_accion: updates.proxima_accion }             : {}),
        ...(updates.proxima_accion_fecha !== undefined ? { proxima_accion_fecha: updates.proxima_accion_fecha } : {}),
        ...(updates.assigned_to                !== undefined ? { assigned_to: updates.assigned_to }                                   : {}),
        ...(updates.creditoAprobadoEntidad    !== undefined ? { creditoAprobadoEntidad: updates.creditoAprobadoEntidad }               : {}),
        ...(updates.creditoRechazadoEntidades !== undefined ? { creditoRechazadoEntidades: updates.creditoRechazadoEntidades }         : {}),
        ...(l.cliente && Object.keys(cp).length > 0 ? { cliente: { ...l.cliente, ...cp } } : {}),
      }
    }))
  }, [])

  if (loading) return (
    <div className="py-20 flex flex-col items-center gap-2 text-gray-400">
      <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <p className="text-sm">Cargando resumen...</p>
    </div>
  )

  return (
    <>
    <div className="space-y-6 pb-8 max-w-[1200px]">

      {/* ══ MÉTRICAS ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <MetricCard label="En pipeline"       value={leadsCore.length}         color="blue"   sub="etapas activas" />
        <MetricCard label="Total seguimiento" value={leadsResumen.length}      color="gray"   sub="excl. perdidos" />
        <MetricCard label="Alertas pendientes" value={totalAlertas}            color={totalAlertas > 0 ? 'red' : 'green'} />
        <MetricCard label="Seg. vencido"      value={segVencido.length}        color={segVencido.length > 0 ? 'red' : 'green'} />
        <ClientesNuevosCard periodo={clientesNuevosPeriodo} onChangePeriodo={setClientesNuevosPeriodo} count={clientesNuevosCount} />
        <MetricCard label="Rec. vencidos"     value={recVencidos.length}       color={recVencidos.length > 0 ? 'red' : 'green'} />
        <MetricCard label="Tasa aprobación crédito" value={tasaAprobacion.pct === null ? '—' : `${tasaAprobacion.pct}%`}
          color={tasaAprobacion.pct === null ? 'gray' : tasaAprobacion.pct >= 70 ? 'green' : tasaAprobacion.pct >= 40 ? 'amber' : 'red'}
          sub={tasaAprobacion.total > 0 ? `${tasaAprobacion.aprobados}/${tasaAprobacion.total} en el período` : 'sin datos en el período'} />
      </div>

      {/* ══ APROBACIÓN DE CRÉDITO POR ENTIDAD ══ */}
      {tasaAprobacion.porEntidad.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-bold text-gray-800 text-sm mb-3">Aprobación de crédito por entidad</h3>
          <div className="space-y-2">
            {tasaAprobacion.porEntidad.map(e => (
              <div key={e.entidad} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate text-gray-600 flex-shrink-0">{e.entidad}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div className="h-4 rounded-full" style={{ width: `${Math.max(4, e.pct ?? 0)}%`, background: tasaColor(e.pct ?? 0) }} />
                </div>
                <span className="w-10 text-right font-bold flex-shrink-0" style={{ color: tasaColor(e.pct ?? 0) }}>{e.pct}%</span>
                <span className="w-20 text-right text-[10px] text-gray-400 flex-shrink-0">{e.aprobados} aprob. / {e.rechazados} rech.</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ DISTRIBUCIÓN + ASESORES ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-bold text-gray-800 text-sm mb-1">Distribución por etapa</h3>
          <p className="text-[10px] text-gray-400 mb-3">Días promedio = tiempo que un cliente pasó en esa etapa antes de avanzar (período seleccionado)</p>
          <div className="space-y-2">
            {porEtapa.map(({ etapa, config, total }) => (
              <BarraHorizontal key={etapa} label={config?.label ?? etapa} count={total} total={leadsResumen.length}
                color={config?.color ?? '#6B7280'} diasProm={diasPromPorEtapa[etapa] ?? null} />
            ))}
            {porEtapa.length === 0 && <p className="text-xs text-gray-400">Sin leads</p>}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-bold text-gray-800 text-sm mb-3">Por asesor</h3>
          <div className="space-y-2">
            {asesoresActivos.map(u => (
              <BarraHorizontal key={u.id} label={u.nombre}
                count={leadsResumen.filter(l => (l.assigned_to ?? '__sin__') === u.id).length}
                total={leadsResumen.length} color={u.id === '__sin__' ? '#6B7280' : '#2563EB'} />
            ))}
          </div>
        </div>
      </div>

      {/* ══ ALERTAS DE REQUISITOS ══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-bold text-gray-800 text-sm">Alertas de requisitos</h3>
          {totalAlertas > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">{totalAlertas} pendientes</span>
          )}
        </div>
        {alertasRequisitos.length === 0 ? (
          <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            ✅ Sin alertas de requisitos pendientes
          </p>
        ) : (
          <div className="space-y-2">
            {alertasRequisitos.map(alerta => (
              <AlertaRequisitoPanel key={alerta.id} alerta={alerta} expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} onOpen={setFichaId} />
            ))}
          </div>
        )}
      </div>

      {/* ══ CLIENTES POR ETAPA (simplificado — filas expandibles) ══ */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800 text-sm">Clientes por etapa</h3>
          <p className="text-xs text-gray-400 mt-0.5">Clic en una etapa para ver los clientes (nombre y asesor) · Clic en un cliente → abrir ficha</p>
        </div>
        <div className="divide-y divide-gray-100">
          {porEtapa.map(({ etapa, config, total, porAsesor }) => {
            const key = `etapa2_${etapa}`
            const abierto = expandidos.has(key)
            const clientesEtapa = Object.values(porAsesor).flat()
            return (
              <div key={etapa}>
                <button onClick={() => toggle(key)} className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: config?.color ?? '#6B7280' }} />
                    <span className="font-medium text-sm text-gray-800">{config?.label ?? etapa}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-gray-800">{total}</span>
                    <span className="text-gray-400 text-xs">{abierto ? '▲' : '▼'}</span>
                  </div>
                </button>
                {abierto && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 px-4 pb-3 bg-gray-50/50">
                    {clientesEtapa.map(l => (
                      <button key={l.id} onClick={() => setFichaId(l.id)}
                        className="text-left px-2.5 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors">
                        <p className="font-semibold text-gray-900 text-xs truncate">{l.cliente?.nombre ?? 'Sin nombre'}</p>
                        <p className="text-[10px] text-gray-400">{l.assigned_to ? (usuariosMap[l.assigned_to] ?? 'Asesor') : 'Sin asignar'} · {l.cliente?.celular ?? 'Sin celular'}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ══ INACTIVIDAD — PIPELINE ACTIVO (excluye revisiones) ══ */}
      <div>
        <h3 className="font-bold text-gray-800 text-sm mb-1">Inactividad — Pipeline activo</h3>
        <p className="text-xs text-gray-400 mb-3">Solo etapas de venta activa. Revisiones y posventa tienen su propia sección.</p>
        <div className="space-y-2">
          <InactividadRow label="+3 días sin actividad"  leads={inactivos.d3}  color="#D97706" bgColor="#FFFBEB" expandKey="d3"  expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} />
          <InactividadRow label="+5 días sin actividad"  leads={inactivos.d5}  color="#EA580C" bgColor="#FFF7ED" expandKey="d5"  expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} />
          <InactividadRow label="+7 días sin actividad"  leads={inactivos.d7}  color="#DC2626" bgColor="#FEF2F2" expandKey="d7"  expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} />
          <InactividadRow label="+14 días sin actividad" leads={inactivos.d14} color="#7F1D1D" bgColor="#FEF2F2" expandKey="d14" expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} />
          {inactivos.d3.length === 0 && (
            <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✅ Todos los leads tuvieron actividad en los últimos 3 días
            </p>
          )}
        </div>
      </div>

      {/* ══ REVISIONES POST-ENTREGA ══ */}
      <div>
        <h3 className="font-bold text-gray-800 text-sm mb-1">Revisiones post-entrega</h3>
        <p className="text-xs text-gray-400 mb-3">
          Entregada: ⚠25d / 🔶30d / 🚨33d+ &nbsp;·&nbsp;
          1ª Rev: ⚠50d / 🔶60d / 🚨70d+ &nbsp;·&nbsp;
          2ª Rev: ⚠80d / 🔶90d / 🚨100d+ &nbsp;·&nbsp;
          3ª Rev: ⚠110d / 🔶120d / 🚨130d+
        </p>
        {(['entregada', 'primera_revision', 'segunda_revision', 'tercera_revision'] as EtapaVenta[]).map(etapa => {
          const enEtapa = revisionesConDias.filter(r => r.etapa_venta === etapa)
          const conAlerta = enEtapa.filter(r => r.nivel !== 'normal')
          const config = ETAPA_MAP[etapa]
          if (enEtapa.length === 0) return null
          return (
            <div key={etapa} className="mb-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => toggle(`rev_${etapa}`)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: config?.color ?? '#6B7280' }} />
                  <span className="font-semibold text-sm text-gray-800">{config?.label}</span>
                  <span className="text-xs text-gray-400">({enEtapa.length} total)</span>
                  {conAlerta.length > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{conAlerta.length} con alerta</span>
                  )}
                </div>
                <span className="text-gray-400 text-xs">{expandidos.has(`rev_${etapa}`) ? '▲' : '▼'}</span>
              </button>
              {expandidos.has(`rev_${etapa}`) && (
                <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {enEtapa
                    .sort((a, b) => b.diasInactivo - a.diasInactivo)
                    .map(r => (
                      <RevisionRow key={r.id} lead={r} dias={r.diasInactivo} nivel={r.nivel} usuariosMap={usuariosMap} onClick={() => setFichaId(r.id)} />
                    ))}
                </div>
              )}
            </div>
          )
        })}
        {revisionesConAlerta.length === 0 && leadsRevision.length > 0 && (
          <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            ✅ Ninguna revisión ha superado sus umbrales de tiempo
          </p>
        )}
        {leadsRevision.length === 0 && (
          <p className="text-xs text-gray-400 px-3 py-2">Sin clientes en etapas de revisión</p>
        )}
      </div>

      {/* ══ RECORDATORIOS + ACCIONES DE HOY + PRÓXIMAS ACCIONES ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-sm">Recordatorios pendientes</h3>
            <div className="flex gap-1.5">
              {recVencidos.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">⚠ {recVencidos.length}</span>}
              {recHoy.length > 0      && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">📌 {recHoy.length}</span>}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {recordatorios.length === 0
              ? <p className="text-xs text-green-600 px-4 py-4">✅ Sin recordatorios pendientes</p>
              : <>
                  {recVencidos.map(r => <RecordatorioRow key={r.id} r={r} tipo="vencido"  usuariosMap={usuariosMap} />)}
                  {recHoy.map(r =>      <RecordatorioRow key={r.id} r={r} tipo="hoy"      usuariosMap={usuariosMap} />)}
                  {recProximos.map(r => <RecordatorioRow key={r.id} r={r} tipo="proximo"  usuariosMap={usuariosMap} />)}
                </>
            }
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-bold text-gray-800 text-sm">Acciones de hoy</h3>
            <p className="text-xs text-gray-400 mt-0.5">Clic para abrir ficha</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {(() => {
              const deHoy = leadsResumen.filter(l => {
                if (!l.proxima_accion_fecha) return false
                const f = new Date(l.proxima_accion_fecha)
                return f.toDateString() === hoyStr
              }).sort((a, b) => new Date(a.proxima_accion_fecha!).getTime() - new Date(b.proxima_accion_fecha!).getTime())
              if (deHoy.length === 0) return <p className="text-xs text-gray-400 px-4 py-4">Sin acciones para hoy</p>
              return deHoy.map(l => {
                const vencido = new Date(l.proxima_accion_fecha!) < ahora
                return <AccionRow key={l.id} l={l} usuariosMap={usuariosMap} onOpen={() => setFichaId(l.id)} vencido={vencido} />
              })
            })()}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-bold text-gray-800 text-sm">Próximas acciones</h3>
            <p className="text-xs text-gray-400 mt-0.5">Solo futuras (no hoy, no vencidas) · Clic para abrir ficha</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {(() => {
              const futuras = leadsResumen.filter(l => l.proxima_accion_fecha && new Date(l.proxima_accion_fecha) > finHoy)
                .sort((a, b) => new Date(a.proxima_accion_fecha!).getTime() - new Date(b.proxima_accion_fecha!).getTime())
              if (futuras.length === 0) return <p className="text-xs text-gray-400 px-4 py-4">Sin acciones futuras programadas</p>
              return futuras.map(l => <AccionRow key={l.id} l={l} usuariosMap={usuariosMap} onOpen={() => setFichaId(l.id)} />)
            })()}
          </div>
        </div>
      </div>

      {/* ══ SIN SEGUIMIENTO ══ */}
      {sinSeguimiento.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <button onClick={() => toggle('sin_seg')} className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 text-left">
            <h3 className="font-bold text-amber-800 text-sm">⚠ Sin seguimiento programado ({sinSeguimiento.length})</h3>
            <span className="text-amber-600 text-xs">{expandidos.has('sin_seg') ? '▲ ocultar' : '▼ ver listado'}</span>
          </button>
          {expandidos.has('sin_seg') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
              {sinSeguimiento.map(l => (
                <button key={l.id} onClick={() => setFichaId(l.id)}
                  className="text-left px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors">
                  <p className="text-xs font-semibold text-gray-900 truncate">{l.cliente?.nombre ?? 'Sin nombre'}</p>
                  <p className="text-[10px] text-gray-500">{ETAPA_MAP[l.etapa_venta]?.label} · {l.assigned_to ? (usuariosMap[l.assigned_to] ?? 'Asesor') : 'Sin asignar'}</p>
                  <p className="text-[10px] text-gray-400">{l.cliente?.celular ?? 'Sin celular'}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

    </div>

    {/* Ficha al hacer clic */}
    {fichaLead && (
      <FichaProspecto
        key={fichaLead.id}
        lead={fichaLead}
        tenantId={tenantId}
        onClose={() => setFichaId(null)}
        onEtapaChange={(id, etapa) => setLeadsLocal(prev => prev.map(l => l.id === id ? { ...l, etapa_venta: etapa } : l))}
        onLeadUpdate={handleLeadUpdate}
        onLeadDelete={(id) => { setLeadsLocal(prev => prev.filter(l => l.id !== id)); setFichaId(null) }}
      />
    )}
    </>
  )
}
