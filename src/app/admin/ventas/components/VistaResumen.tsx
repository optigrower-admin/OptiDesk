'use client'
import React from 'react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ETAPAS_ACTIVAS, ETAPA_MAP, ETAPAS_LEADS, ETAPAS_NECESITAN_PLACA, ETAPAS_NECESITAN_FACTURA,
  type EtapaVenta,
} from '@/lib/ventas/pipeline'
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
}
interface ActividadMap { [clienteId: string]: string }
interface Recordatorio {
  id: string; nota: string | null; fecha_recordatorio: string
  asignado_a: string | null; cliente_id: string | null
  clientes: { nombre: string | null; celular: string | null } | null
}
type LeadConDias = LeadData & { diasInactivo: number }
type NivelRevision = 'normal' | 'alerta' | 'riesgo' | 'peligro'

/* ─── helpers ────────────────────────────────────────────────────── */
const diasDesde = (iso?: string) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0
const fmtFecha  = (iso: string)  => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
const fmtMillon = (n: number)    => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n/1_000).toFixed(0)}k` : `$${n}`

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

function BarraHorizontal({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.max(4, Math.round((count / total) * 100)) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-36 truncate text-gray-600 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div className="h-4 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-6 text-right font-bold text-gray-700 flex-shrink-0">{count}</span>
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

/* Alerta de requisito con desglose por asesor */
function AlertaRequisitoPanel({ alerta, expandidos, toggle, usuariosMap }: {
  alerta: { id: string; icon: string; label: string; color: string; bg: string; border: string; porAsesor: Record<string, LeadData[]> }
  expandidos: Set<string>; toggle: (k: string) => void; usuariosMap: Record<string, string>
}) {
  const total = Object.values(alerta.porAsesor).reduce((s, arr) => s + arr.length, 0)
  if (total === 0) return null
  const abierto = expandidos.has(alerta.id)
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: alerta.border }}>
      {/* Header */}
      <button onClick={() => toggle(alerta.id)} className="w-full flex items-center justify-between px-4 py-2.5 text-left" style={{ background: alerta.bg }}>
        <div className="flex items-center gap-2">
          <span>{alerta.icon}</span>
          <span className="font-semibold text-sm" style={{ color: alerta.color }}>{alerta.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-black text-lg" style={{ color: alerta.color }}>{total}</span>
          <span className="text-xs" style={{ color: alerta.color }}>{abierto ? '▲' : '▼'}</span>
        </div>
      </button>
      {/* Desglose por asesor */}
      {abierto && (
        <div className="bg-white">
          {Object.entries(alerta.porAsesor).map(([asId, leads]) => {
            const asNombre = asId === '__sin__' ? 'Sin asignar' : (usuariosMap[asId] ?? 'Asesor')
            const subKey = `${alerta.id}__${asId}`
            const subAbierto = expandidos.has(subKey)
            return (
              <div key={asId} className="border-t border-gray-100">
                <button onClick={() => toggle(subKey)} className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0" style={{ background: alerta.color }}>
                      {asNombre.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-gray-800">{asNombre}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: alerta.color }}>{leads.length}</span>
                    <span className="text-gray-400 text-xs">{subAbierto ? '▲' : '▼'}</span>
                  </div>
                </button>
                {subAbierto && (
                  <div className="px-4 pb-2 space-y-1">
                    {leads.map(l => (
                      <div key={l.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                        <div>
                          <span className="font-semibold text-gray-900">{l.cliente?.nombre ?? 'Sin nombre'}</span>
                          <span className="text-gray-400 ml-2">{ETAPA_MAP[l.etapa_venta]?.label}</span>
                        </div>
                        <span className="text-gray-500 font-mono">{l.cliente?.celular ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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

/* ─── componente principal ────────────────────────────────────────── */
export default function VistaResumen({ leads, tenantId, usuarios }: Props) {
  const supabase = createClient()
  const [actividad,     setActividad]     = useState<ActividadMap>({})
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [ordenesMap,    setOrdenesMap]    = useState<Record<string, number>>({}) // clienteId → count of service ordenes
  const [loading,       setLoading]       = useState(true)
  const [expandidos,    setExpandidos]    = useState<Set<string>>(new Set())
  const [fichaId,       setFichaId]       = useState<string | null>(null)
  const [leadsLocal,    setLeadsLocal]    = useState<LeadData[]>(leads)

  const usuariosMap = useMemo(() => Object.fromEntries(usuarios.map(u => [u.id, u.nombre])), [usuarios])

  // Actualizar leads cuando el prop cambia
  useEffect(() => { setLeadsLocal(leads) }, [leads])

  /* ── Segmentación de leads ── */
  const leadsResumen  = useMemo(() => leadsLocal.filter(l => !(EXCLUIR_RESUMEN as string[]).includes(l.etapa_venta)), [leadsLocal])
  const leadsCore     = useMemo(() => leadsLocal.filter(l => (ETAPAS_ACTIVAS as string[]).includes(l.etapa_venta)), [leadsLocal])
  const leadsRevision = useMemo(() => leadsLocal.filter(l => (ETAPAS_REVISION as string[]).includes(l.etapa_venta)), [leadsLocal])

  /* ── Fetch datos externos ── */
  useEffect(() => {
    if (!tenantId) return
    const clienteIds = leadsResumen.map(l => l.cliente?.id).filter((id): id is string => !!id)
    const revClientIds = leadsRevision
      .filter(l => ['segunda_revision', 'tercera_revision'].includes(l.etapa_venta))
      .map(l => l.cliente?.id).filter((id): id is string => !!id)

    Promise.all([
      // updated_at de clientes
      clienteIds.length > 0
        ? supabase.from('clientes').select('id, updated_at').in('id', clienteIds)
        : Promise.resolve({ data: [] }),
      // Recordatorios pendientes próximos 7 días
      supabase.from('recordatorios')
        .select('id, nota, fecha_recordatorio, asignado_a, cliente_id, clientes(nombre, celular)')
        .eq('tenant_id', tenantId).eq('completado', false)
        .lte('fecha_recordatorio', new Date(Date.now() + 7 * 86400000).toISOString())
        .order('fecha_recordatorio').limit(200),
      // Ordenes de servicio para clientes en revisiones
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

  const toggle = useCallback((k: string) => {
    setExpandidos(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }, [])

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

  /* ── Alertas de requisitos ── */
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
    ].filter(a => a.leads.length > 0).map(a => ({ ...a, porAsesor: groupByAsesor(a.leads) }))
  }, [leadsResumen, leadsRevision, ordenesMap])

  /* ── Métricas globales ── */
  const sinSeguimiento    = leadsResumen.filter(l => !l.proxima_accion_fecha)
  const segVencido        = leadsResumen.filter(l => l.proxima_accion_fecha && new Date(l.proxima_accion_fecha) < new Date())
  const conMsgSinRes      = leadsResumen.filter(l => l.sin_respuesta_asesor_desde && (Date.now() - new Date(l.sin_respuesta_asesor_desde).getTime()) > 15 * 60000)
  const valorPipeline     = leadsCore.reduce((s, l) => s + (l.valor_estimado_venta ?? 0), 0)
  const ahora             = new Date()
  const hoyStr            = ahora.toDateString()
  const recVencidos       = recordatorios.filter(r => new Date(r.fecha_recordatorio) < ahora)
  const recHoy            = recordatorios.filter(r => { const d = new Date(r.fecha_recordatorio); return d.toDateString() === hoyStr && d >= ahora })
  const recProximos       = recordatorios.filter(r => { const d = new Date(r.fecha_recordatorio); return d > ahora && d.toDateString() !== hoyStr })
  const totalAlertas      = alertasRequisitos.reduce((s, a) => s + Object.values(a.porAsesor).reduce((ss, arr) => ss + arr.length, 0), 0)

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
    }).sort((a, b) => (ETAPA_MAP[a.etapa]?.id && ETAPA_MAP[b.etapa]?.id ? 0 : 0))
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
    <div className="space-y-6 pb-8">

      {/* ══ MÉTRICAS ══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="En pipeline"       value={leadsCore.length}         color="blue"   sub="etapas activas" />
        <MetricCard label="Total seguimiento" value={leadsResumen.length}      color="gray"   sub="excl. perdidos" />
        <MetricCard label="Alertas pendientes" value={totalAlertas}            color={totalAlertas > 0 ? 'red' : 'green'} />
        <MetricCard label="Seg. vencido"      value={segVencido.length}        color={segVencido.length > 0 ? 'red' : 'green'} />
        <MetricCard label="Rec. vencidos"     value={recVencidos.length}       color={recVencidos.length > 0 ? 'red' : 'green'} />
        <MetricCard label="Valor pipeline"    value={fmtMillon(valorPipeline)} color="purple" />
      </div>

      {/* ══ DISTRIBUCIÓN + ASESORES ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-bold text-gray-800 text-sm mb-3">Distribución por etapa</h3>
          <div className="space-y-2">
            {porEtapa.map(({ etapa, config, total }) => (
              <BarraHorizontal key={etapa} label={config?.label ?? etapa} count={total} total={leadsResumen.length} color={config?.color ?? '#6B7280'} />
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
              <AlertaRequisitoPanel key={alerta.id} alerta={alerta} expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} />
            ))}
          </div>
        )}
      </div>

      {/* ══ TABLA ETAPA × ASESOR ══ */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800 text-sm">Clientes por etapa y asesor</h3>
          <p className="text-xs text-gray-400 mt-0.5">Clic en un número → ver clientes · Clic en nombre → abrir ficha</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-2 font-semibold text-gray-600">Etapa</th>
                {asesoresActivos.map(u => (
                  <th key={u.id} className="text-center px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">{u.nombre.split(' ')[0]}</th>
                ))}
                <th className="text-center px-3 py-2 font-semibold text-gray-800 bg-gray-100">Total</th>
              </tr>
            </thead>
            <tbody>
              {porEtapa.map(({ etapa, config, total, porAsesor }) => (
                <React.Fragment key={etapa}>
                  <tr className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: config?.color ?? '#6B7280' }} />
                        <span className="text-gray-700 font-medium">{config?.label ?? etapa}</span>
                      </div>
                    </td>
                    {asesoresActivos.map(u => {
                      const grupo = porAsesor[u.id]
                      const key = `tab__${etapa}__${u.id}`
                      return (
                        <td key={u.id} className="px-3 py-2 text-center">
                          {grupo ? (
                            <button onClick={() => toggle(key)}
                              className="w-7 h-7 rounded-full font-bold text-white text-xs mx-auto flex items-center justify-center hover:scale-110 transition-transform"
                              style={{ background: expandidos.has(key) ? '#1D4ED8' : (config?.color ?? '#6B7280') }}>
                              {grupo.length}
                            </button>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-center font-black text-gray-800">{total}</td>
                  </tr>
                  {asesoresActivos.map(u => {
                    const key = `tab__${etapa}__${u.id}`
                    const grupo = porAsesor[u.id]
                    if (!expandidos.has(key) || !grupo) return null
                    return (
                      <tr key={`exp_${key}`} className="border-b bg-blue-50/40">
                        <td colSpan={asesoresActivos.length + 2} className="px-4 py-2">
                          <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">{config?.label} · {usuariosMap[u.id] ?? 'Sin asignar'} ({grupo.length})</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                            {grupo.map(l => (
                              <button key={l.id} onClick={() => setFichaId(l.id)}
                                className="text-left px-2.5 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors">
                                <p className="font-semibold text-gray-900 text-xs truncate">{l.cliente?.nombre ?? 'Sin nombre'}</p>
                                <p className="text-[10px] text-gray-400">{l.cliente?.celular ?? 'Sin celular'}</p>
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}
              <tr className="bg-gray-50 border-t-2">
                <td className="px-4 py-2 font-bold text-gray-700">Total</td>
                {asesoresActivos.map(u => (
                  <td key={u.id} className="px-3 py-2 text-center font-black text-gray-800">
                    {leadsResumen.filter(l => (l.assigned_to ?? '__sin__') === u.id).length}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-black text-blue-700">{leadsResumen.length}</td>
              </tr>
            </tbody>
          </table>
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

      {/* ══ RECORDATORIOS + PRÓXIMAS ACCIONES ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-sm">Recordatorios pendientes</h3>
            <div className="flex gap-1.5">
              {recVencidos.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">⚠ {recVencidos.length} vencidos</span>}
              {recHoy.length > 0      && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">📌 {recHoy.length} hoy</span>}
              {recProximos.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{recProximos.length} próx.</span>}
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
            <h3 className="font-bold text-gray-800 text-sm">Próximas acciones</h3>
            <p className="text-xs text-gray-400 mt-0.5">Vencidas primero · Clic para abrir ficha</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {(() => {
              const conAccion = leadsResumen.filter(l => l.proxima_accion_fecha)
                .sort((a, b) => new Date(a.proxima_accion_fecha!).getTime() - new Date(b.proxima_accion_fecha!).getTime())
              if (conAccion.length === 0) return <p className="text-xs text-gray-400 px-4 py-4">Sin acciones programadas</p>
              return conAccion.map(l => {
                const fecha   = new Date(l.proxima_accion_fecha!)
                const vencido = fecha < ahora
                const esHoy   = fecha.toDateString() === hoyStr && !vencido
                return (
                  <button key={l.id} onClick={() => setFichaId(l.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
                    <div className="flex items-start gap-2">
                      <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${vencido ? 'bg-red-500' : esHoy ? 'bg-amber-500' : 'bg-blue-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{l.cliente?.nombre ?? 'Sin nombre'}</p>
                        <p className="text-[11px] text-blue-700 truncate">📌 {l.proxima_accion}</p>
                        <p className={`text-[10px] ${vencido ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                          {vencido ? '⚠ ' : ''}{fmtFecha(l.proxima_accion_fecha!)}
                          {l.assigned_to && <span className="ml-2">· {usuariosMap[l.assigned_to] ?? ''}</span>}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })
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

