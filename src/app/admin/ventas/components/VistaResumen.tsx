'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ETAPAS, ETAPAS_ACTIVAS, ETAPA_MAP, type EtapaVenta } from '@/lib/ventas/pipeline'
import type { LeadData } from './LeadCard'
import FichaProspecto from './FichaProspecto'

interface Props {
  leads: LeadData[]
  tenantId: string
  usuarios: { id: string; nombre: string }[]
}

interface ActividadMap { [clienteId: string]: string /* updated_at ISO */ }

interface Recordatorio {
  id: string
  nota: string | null
  fecha_recordatorio: string
  asignado_a: string | null
  cliente_id: string | null
  clientes: { nombre: string | null; celular: string | null } | null
}

type LeadConDias = LeadData & { diasInactivo: number }

/* ─── helpers ─────────────────────────────────────────────────────── */
function diasDesde(iso: string | undefined): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}
function fmtTel(t: string | null) { return t ?? '—' }
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtMillon(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${n}`
}

/* ─── sub-componentes UI ──────────────────────────────────────────── */
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
      <p className="text-xs font-medium opacity-70">{label}</p>
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
        <div className="h-4 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-6 text-right font-bold text-gray-700 flex-shrink-0">{count}</span>
    </div>
  )
}

function InactividadRow({
  label, leads, color, bgColor, expandKey, expandidos, toggle, usuariosMap
}: {
  label: string
  leads: LeadConDias[]
  color: string
  bgColor: string
  expandKey: string
  expandidos: Set<string>
  toggle: (k: string) => void
  usuariosMap: Record<string, string>
}) {
  const abierto = expandidos.has(expandKey)
  if (leads.length === 0) return null
  return (
    <div className={`rounded-xl border overflow-hidden`} style={{ borderColor: color }}>
      <button
        onClick={() => toggle(expandKey)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
        style={{ background: bgColor }}
      >
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
              <span className="text-xs text-gray-500 flex-shrink-0">{fmtTel(l.cliente?.celular ?? null)}</span>
              <span className="text-xs font-bold flex-shrink-0 px-1.5 py-0.5 rounded-full text-white" style={{ background: color }}>
                {l.diasInactivo}d
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── componente principal ────────────────────────────────────────── */
export default function VistaResumen({ leads, tenantId, usuarios }: Props) {
  const supabase = createClient()
  const [actividad, setActividad]       = useState<ActividadMap>({})
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [loading, setLoading]           = useState(true)
  const [expandidos, setExpandidos]     = useState<Set<string>>(new Set())
  const [fichaId, setFichaId]           = useState<string | null>(null)
  const [leads_local, setLeadsLocal]    = useState<LeadData[]>(leads)

  const usuariosMap = useMemo(() =>
    Object.fromEntries(usuarios.map(u => [u.id, u.nombre])), [usuarios])

  const leadsActivos = useMemo(() =>
    leads_local.filter(l => (ETAPAS_ACTIVAS as string[]).includes(l.etapa_venta)), [leads_local])

  useEffect(() => { setLeadsLocal(leads) }, [leads])

  useEffect(() => {
    if (!tenantId) return
    const clienteIds = leads
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
    ]).then(([{ data: cl }, { data: rec }]) => {
      const map: ActividadMap = {}
      for (const c of (cl ?? []) as { id: string; updated_at: string }[]) map[c.id] = c.updated_at
      setActividad(map)
      setRecordatorios((rec ?? []) as unknown as Recordatorio[])
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const toggle = useCallback((k: string) => {
    setExpandidos(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }, [])

  /* ── inactividad ── */
  const leadsConDias: LeadConDias[] = useMemo(() =>
    leadsActivos.map(l => ({
      ...l,
      diasInactivo: diasDesde(l.cliente?.id ? actividad[l.cliente.id] : undefined),
    })), [leadsActivos, actividad])

  const inactivos = useMemo(() => ({
    d3:  leadsConDias.filter(l => l.diasInactivo >= 3),
    d5:  leadsConDias.filter(l => l.diasInactivo >= 5),
    d7:  leadsConDias.filter(l => l.diasInactivo >= 7),
    d14: leadsConDias.filter(l => l.diasInactivo >= 14),
  }), [leadsConDias])

  /* ── métricas ── */
  const sinSeguimiento   = leadsActivos.filter(l => !l.proxima_accion_fecha)
  const segVencido       = leadsActivos.filter(l => l.proxima_accion_fecha && new Date(l.proxima_accion_fecha) < new Date())
  const valorPipeline    = leadsActivos.reduce((s, l) => s + (l.valor_estimado_venta ?? 0), 0)
  const conMensajeSinRes = leadsActivos.filter(l => l.sin_respuesta_asesor_desde && (Date.now() - new Date(l.sin_respuesta_asesor_desde).getTime()) > 15 * 60000)

  /* ── por etapa ── */
  const porEtapa = useMemo(() => {
    return ETAPAS_ACTIVAS.map(etapa => {
      const enEtapa = leadsActivos.filter(l => l.etapa_venta === etapa)
      const porAsesor: Record<string, LeadData[]> = {}
      for (const l of enEtapa) {
        const k = l.assigned_to ?? '__sin__'
        if (!porAsesor[k]) porAsesor[k] = []
        porAsesor[k].push(l)
      }
      return { etapa, config: ETAPA_MAP[etapa], total: enEtapa.length, porAsesor }
    }).filter(e => e.total > 0)
  }, [leadsActivos])

  /* ── recordatorios ── */
  const ahora = new Date()
  const hoyStr = ahora.toDateString()
  const recVencidos  = recordatorios.filter(r => new Date(r.fecha_recordatorio) < ahora)
  const recHoy       = recordatorios.filter(r => {
    const d = new Date(r.fecha_recordatorio)
    return d.toDateString() === hoyStr && d >= ahora
  })
  const recProximos  = recordatorios.filter(r => {
    const d = new Date(r.fecha_recordatorio)
    return d > ahora && d.toDateString() !== hoyStr
  })

  /* ── asesores activos ── */
  const asesoresActivos = useMemo(() => {
    const ids = new Set(leadsActivos.map(l => l.assigned_to ?? '__sin__'))
    return [
      ...usuarios.filter(u => ids.has(u.id)).map(u => ({ id: u.id, nombre: u.nombre })),
      ...(ids.has('__sin__') ? [{ id: '__sin__', nombre: 'Sin asignar' }] : []),
    ]
  }, [leadsActivos, usuarios])

  const fichaLead = fichaId ? leads_local.find(l => l.id === fichaId) ?? null : null

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

        {/* ══ MÉTRICAS PRINCIPALES ══ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Leads activos"    value={leadsActivos.length}      color="blue" />
          <MetricCard label="Sin seguimiento"  value={sinSeguimiento.length}    color={sinSeguimiento.length > 0 ? 'amber' : 'green'} />
          <MetricCard label="Seg. vencido"     value={segVencido.length}        color={segVencido.length > 0 ? 'red' : 'green'} />
          <MetricCard label="Msg sin responder" value={conMensajeSinRes.length} color={conMensajeSinRes.length > 0 ? 'red' : 'green'} />
          <MetricCard label="Recordatorios venc." value={recVencidos.length}    color={recVencidos.length > 0 ? 'red' : 'green'} />
          <MetricCard label="Valor pipeline"   value={fmtMillon(valorPipeline)} color="purple" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ══ DISTRIBUCIÓN POR ETAPA ══ */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-3">Distribución por etapa</h3>
            <div className="space-y-2">
              {porEtapa.map(({ etapa, config, total }) => (
                <BarraHorizontal
                  key={etapa}
                  label={config.label}
                  count={total}
                  total={leadsActivos.length}
                  color={config.color}
                />
              ))}
              {porEtapa.length === 0 && <p className="text-xs text-gray-400">Sin leads activos</p>}
            </div>
          </div>

          {/* ══ POR ASESOR ══ */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-3">Leads por asesor</h3>
            <div className="space-y-2">
              {asesoresActivos.map(u => {
                const count = leadsActivos.filter(l => (l.assigned_to ?? '__sin__') === u.id).length
                return (
                  <BarraHorizontal
                    key={u.id}
                    label={u.nombre}
                    count={count}
                    total={leadsActivos.length}
                    color={u.id === '__sin__' ? '#6B7280' : '#2563EB'}
                  />
                )
              })}
            </div>
          </div>
        </div>

        {/* ══ ALERTAS DE INACTIVIDAD ══ */}
        <div>
          <h3 className="font-bold text-gray-800 text-sm mb-3">
            Alertas de inactividad
            <span className="text-xs font-normal text-gray-400 ml-2">· días desde última actividad en el registro</span>
          </h3>
          <div className="space-y-2">
            <InactividadRow label="Sin actividad +3 días"  leads={inactivos.d3}  color="#D97706" bgColor="#FFFBEB" expandKey="d3"  expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} />
            <InactividadRow label="Sin actividad +5 días"  leads={inactivos.d5}  color="#EA580C" bgColor="#FFF7ED" expandKey="d5"  expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} />
            <InactividadRow label="Sin actividad +7 días"  leads={inactivos.d7}  color="#DC2626" bgColor="#FEF2F2" expandKey="d7"  expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} />
            <InactividadRow label="Sin actividad +14 días" leads={inactivos.d14} color="#7F1D1D" bgColor="#FEF2F2" expandKey="d14" expandidos={expandidos} toggle={toggle} usuariosMap={usuariosMap} />
            {inactivos.d3.length === 0 && (
              <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                ✅ Todos los leads tuvieron actividad en los últimos 3 días
              </p>
            )}
          </div>
        </div>

        {/* ══ POR ETAPA × ASESOR (tabla interactiva) ══ */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="font-bold text-gray-800 text-sm">Clientes por etapa y asesor</h3>
            <p className="text-xs text-gray-400 mt-0.5">Haz clic en un número para ver los clientes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-2 font-semibold text-gray-600">Etapa</th>
                  {asesoresActivos.map(u => (
                    <th key={u.id} className="text-center px-3 py-2 font-semibold text-gray-600 whitespace-nowrap min-w-[80px]">
                      {u.nombre.split(' ')[0]}
                    </th>
                  ))}
                  <th className="text-center px-3 py-2 font-semibold text-gray-800 bg-gray-100">Total</th>
                </tr>
              </thead>
              <tbody>
                {porEtapa.map(({ etapa, config, total, porAsesor }) => (
                  <>
                    <tr key={etapa} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: config.color }} />
                          <span className="text-gray-700 font-medium">{config.label}</span>
                        </div>
                      </td>
                      {asesoresActivos.map(u => {
                        const grupo = porAsesor[u.id]
                        const key = `${etapa}__${u.id}`
                        const abierto = expandidos.has(key)
                        return (
                          <td key={u.id} className="px-3 py-2 text-center">
                            {grupo ? (
                              <button
                                onClick={() => toggle(key)}
                                className="w-7 h-7 rounded-full font-bold text-white text-xs mx-auto flex items-center justify-center transition-transform hover:scale-110"
                                style={{ background: abierto ? '#1D4ED8' : config.color }}
                              >
                                {grupo.length}
                              </button>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-center font-black text-gray-800">{total}</td>
                    </tr>
                    {/* Fila expandida */}
                    {asesoresActivos.map(u => {
                      const key = `${etapa}__${u.id}`
                      const grupo = porAsesor[u.id]
                      if (!expandidos.has(key) || !grupo) return null
                      return (
                        <tr key={`exp_${key}`} className="border-b">
                          <td colSpan={asesoresActivos.length + 2} className="px-4 py-0">
                            <div className="py-2">
                              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1.5">
                                {config.label} · {usuariosMap[u.id] ?? 'Sin asignar'} ({grupo.length})
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                {grupo.map(l => (
                                  <button
                                    key={l.id}
                                    onClick={() => setFichaId(l.id)}
                                    className="text-left px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 transition-colors"
                                  >
                                    <p className="font-semibold text-gray-900 text-xs truncate">{l.cliente?.nombre ?? 'Sin nombre'}</p>
                                    <p className="text-[10px] text-gray-400">{l.cliente?.celular ?? 'Sin celular'}</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </>
                ))}
                {/* Fila totales */}
                <tr className="bg-gray-50 border-t-2">
                  <td className="px-4 py-2 font-bold text-gray-700">Total</td>
                  {asesoresActivos.map(u => {
                    const total = leadsActivos.filter(l => (l.assigned_to ?? '__sin__') === u.id).length
                    return (
                      <td key={u.id} className="px-3 py-2 text-center font-black text-gray-800">{total}</td>
                    )
                  })}
                  <td className="px-3 py-2 text-center font-black text-blue-700">{leadsActivos.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ══ RECORDATORIOS Y PRÓXIMAS ACCIONES ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Recordatorios */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-800 text-sm">Recordatorios pendientes</h3>
              <div className="flex gap-1.5">
                {recVencidos.length > 0  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">⚠ {recVencidos.length} vencidos</span>}
                {recHoy.length > 0       && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">📌 {recHoy.length} hoy</span>}
                {recProximos.length > 0  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{recProximos.length} próx.</span>}
              </div>
            </div>
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {recordatorios.length === 0 && (
                <p className="text-xs text-green-600 px-4 py-4">✅ Sin recordatorios pendientes</p>
              )}
              {recVencidos.map(r => (
                <RecordatorioRow key={r.id} r={r} tipo="vencido" usuariosMap={usuariosMap} />
              ))}
              {recHoy.map(r => (
                <RecordatorioRow key={r.id} r={r} tipo="hoy" usuariosMap={usuariosMap} />
              ))}
              {recProximos.map(r => (
                <RecordatorioRow key={r.id} r={r} tipo="proximo" usuariosMap={usuariosMap} />
              ))}
            </div>
          </div>

          {/* Próximas acciones del día */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="font-bold text-gray-800 text-sm">Próximas acciones programadas</h3>
              <p className="text-xs text-gray-400 mt-0.5">Vencidas primero, luego de hoy, luego futuras</p>
            </div>
            <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
              {(() => {
                const conAccion = leadsActivos
                  .filter(l => l.proxima_accion_fecha)
                  .sort((a, b) => new Date(a.proxima_accion_fecha!).getTime() - new Date(b.proxima_accion_fecha!).getTime())
                if (conAccion.length === 0)
                  return <p className="text-xs text-gray-400 px-4 py-4">Sin acciones programadas</p>
                return conAccion.map(l => {
                  const fecha = new Date(l.proxima_accion_fecha!)
                  const vencido = fecha < ahora
                  const esHoy   = fecha.toDateString() === hoyStr && !vencido
                  return (
                    <button
                      key={l.id}
                      onClick={() => setFichaId(l.id)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
                    >
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

        {/* ══ SIN SEGUIMIENTO (lista completa) ══ */}
        {sinSeguimiento.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <button
              onClick={() => toggle('sin_seg')}
              className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 text-left"
            >
              <h3 className="font-bold text-amber-800 text-sm">⚠ Sin seguimiento programado ({sinSeguimiento.length})</h3>
              <span className="text-amber-600 text-xs">{expandidos.has('sin_seg') ? '▲ ocultar' : '▼ ver listado'}</span>
            </button>
            {expandidos.has('sin_seg') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                {sinSeguimiento.map(l => (
                  <button
                    key={l.id}
                    onClick={() => setFichaId(l.id)}
                    className="text-left px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
                  >
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

      {/* Ficha al hacer clic en un cliente */}
      {fichaLead && (
        <FichaProspecto
          lead={fichaLead}
          tenantId={tenantId}
          onClose={() => setFichaId(null)}
          onEtapaChange={(id, etapa) => {
            setLeadsLocal(prev => prev.map(l => l.id === id ? { ...l, etapa_venta: etapa } : l))
          }}
          onLeadUpdate={(id, updates) => {
            setLeadsLocal(prev => prev.map(l => {
              if (l.id !== id) return l
              const clientePatch: Record<string, unknown> = {}
              if (updates.nombre  !== undefined) clientePatch.nombre  = updates.nombre
              if (updates.celular !== undefined) clientePatch.celular = updates.celular
              if (updates.placa   !== undefined) clientePatch.placa   = updates.placa
              return {
                ...l,
                ...(updates.proxima_accion       !== undefined ? { proxima_accion: updates.proxima_accion }             : {}),
                ...(updates.proxima_accion_fecha !== undefined ? { proxima_accion_fecha: updates.proxima_accion_fecha } : {}),
                ...(updates.assigned_to          !== undefined ? { assigned_to: updates.assigned_to }                   : {}),
                ...(l.cliente && Object.keys(clientePatch).length > 0 ? { cliente: { ...l.cliente, ...clientePatch } } : {}),
              }
            }))
          }}
          onLeadDelete={(id) => { setLeadsLocal(prev => prev.filter(l => l.id !== id)); setFichaId(null) }}
        />
      )}
    </>
  )
}

function RecordatorioRow({ r, tipo, usuariosMap }: {
  r: Recordatorio
  tipo: 'vencido' | 'hoy' | 'proximo'
  usuariosMap: Record<string, string>
}) {
  const colores = {
    vencido: 'text-red-600',
    hoy:     'text-amber-600',
    proximo: 'text-blue-600',
  }
  return (
    <div className="px-4 py-2.5">
      <div className="flex items-start gap-2">
        <span className={`text-xs font-bold flex-shrink-0 mt-0.5 ${colores[tipo]}`}>
          {tipo === 'vencido' ? '⚠' : tipo === 'hoy' ? '📌' : '🔔'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">
            {r.clientes?.nombre ?? 'Cliente'}{r.clientes?.celular ? ` · ${r.clientes.celular}` : ''}
          </p>
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
