'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useEtapasPipeline } from '@/hooks/useEtapasPipeline'
import type { LeadData } from './components/LeadCard'
import PipelineKanban from './components/PipelineKanban'
import VistaHoy from './components/VistaHoy'
import VistaLista from './components/VistaLista'
import VistaBandeja from './VistaBandeja'
import { ImportadorExcel } from '@/components/ImportadorExcel'
import { importarSeguimientoVentas, previsualizarSeguimientoVentas } from '@/lib/bulkImport'
import WhatsAppCreditoModal from './components/WhatsAppCreditoModal'
import NuevoClienteForm from './components/NuevoClienteForm'

type Tab = 'kanban' | 'bandeja' | 'hoy' | 'lista'

interface Props {
  leadsIniciales: LeadData[]
  tenantId: string
}

type UsuarioFiltro = { id: string; nombre: string }
type EntidadFiltro = { id: string; nombre: string }
const ESTADO_CREDITO_OPCIONES: { key: string; label: string }[] = [
  { key: 'sin_iniciar', label: 'Sin iniciar' },
  { key: 'en_estudio', label: 'En estudio' },
  { key: 'aprobado', label: 'Aprobado' },
  { key: 'rechazado', label: 'Rechazado' },
]

export default function VentasClient({ leadsIniciales, tenantId }: Props) {
  const { profile } = useAuth()
  const rolNorm = (profile?.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esFreelancer = rolNorm === 'freelancer'
  const supabase = createClient()
  const etapasPipeline = useEtapasPipeline(tenantId)
  const [tab, setTab] = useState<Tab>('kanban')
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [usuarios, setUsuarios] = useState<UsuarioFiltro[]>([])
  const [usuariosFiltro, setUsuariosFiltro] = useState<Set<string>>(new Set())
  const [entidadesCredito, setEntidadesCredito] = useState<EntidadFiltro[]>([])
  const [creditoFiltro, setCreditoFiltro] = useState<Record<string, Set<string>>>({})
  const [creditoPanelOpen, setCreditoPanelOpen] = useState(false)
  const [abrirClienteId, setAbrirClienteId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [pipelineTabsSlot, setPipelineTabsSlot] = useState<HTMLDivElement | null>(null)
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [idsExtraSearch, setIdsExtraSearch] = useState<Set<string>>(new Set())
  const [buscandoExtra, setBuscandoExtra] = useState(false)

  // Estado compartido de leads — para que un cambio hecho en cualquier vista (Kanban,
  // Hoy, Lista, Bandeja) se refleje de inmediato en el contador de arriba y en las
  // demás vistas, incluso si se cambia de pestaña (lo que remonta esa vista).
  const [leadsState, setLeadsState] = useState<LeadData[]>(leadsIniciales)
  useEffect(() => { setLeadsState(leadsIniciales) }, [leadsIniciales])

  const patchLead = useCallback((id: string, patch: Record<string, unknown>) => {
    setLeadsState(prev => prev.map(l => {
      if (l.id !== id) return l
      const clientePatch: Record<string, unknown> = {}
      if (patch.nombre  !== undefined) clientePatch.nombre  = patch.nombre
      if (patch.celular !== undefined) clientePatch.celular = patch.celular
      if (patch.placa   !== undefined) clientePatch.placa   = patch.placa
      return {
        ...l,
        ...patch,
        ...(l.cliente && Object.keys(clientePatch).length > 0 ? { cliente: { ...l.cliente, ...clientePatch } } : {}),
      } as LeadData
    }))
  }, [])

  const removeLead = useCallback((id: string) => {
    setLeadsState(prev => prev.filter(l => l.id !== id))
  }, [])

  // Al crear un cliente nuevo: lo trae y abre su ficha de inmediato, sin recargar la página.
  const cargarClienteYAbrir = useCallback(async (clienteId: string) => {
    setNuevoOpen(false)
    const { data: c } = await supabase
      .from('clientes')
      .select(`
        id, nombre, celular, etapa_venta, etapa_venta_orden,
        valor_estimado_venta, proxima_accion, proxima_accion_fecha,
        lead_source, sin_respuesta_asesor_desde, assigned_to,
        nombre_pendiente_aprobacion, alistamiento_orden_id,
        primer_apellido, cedula, email, estado_aprobacion_matricula, aprobado_matricula_por,
        placa, numero_factura, created_at,
        conversaciones ( id, canal, no_leidos_count )
      `)
      .eq('id', clienteId).single()
    if (!c) return

    const convs = (c.conversaciones as { id: string; canal: string; no_leidos_count: number }[] | null) ?? []
    const noLeidos = convs.reduce((s, cv) => s + (cv.no_leidos_count ?? 0), 0)
    const nuevoLead: LeadData = {
      id: c.id as string,
      etapa_venta: (c.etapa_venta ?? 'nuevo') as LeadData['etapa_venta'],
      etapa_venta_orden: (c.etapa_venta_orden ?? 0) as number,
      moto_interes: null,
      valor_estimado_venta: (c.valor_estimado_venta ?? null) as number | null,
      proxima_accion: (c.proxima_accion ?? null) as string | null,
      proxima_accion_fecha: (c.proxima_accion_fecha ?? null) as string | null,
      canal: convs[0]?.canal ?? 'manual',
      lead_source: (c.lead_source ?? null) as string | null,
      no_leidos_count: noLeidos,
      sin_respuesta_asesor_desde: (c.sin_respuesta_asesor_desde ?? null) as string | null,
      assigned_to: (c.assigned_to ?? null) as string | null,
      cliente: { id: c.id as string, nombre: (c.nombre ?? null) as string | null, celular: (c.celular ?? null) as string | null, placa: (c.placa ?? null) as string | null },
      alistamientoOrdenId: (c.alistamiento_orden_id ?? null) as string | null,
      cliente_apellido: (c.primer_apellido ?? null) as string | null,
      cliente_documento: (c.cedula ?? null) as string | null,
      cliente_email: (c.email ?? null) as string | null,
      nombre_pendiente_aprobacion: (c.nombre_pendiente_aprobacion ?? null) as boolean | null,
      leads_campana: [],
      todas_conversaciones: convs.map(cv => ({ id: cv.id, canal: cv.canal, no_leidos_count: cv.no_leidos_count ?? 0 })),
      etiquetas: [],
      estadoAprobacionMatricula: ((c.estado_aprobacion_matricula ?? 'pendiente') as 'pendiente' | 'aprobado' | 'rechazado'),
      aprobadoMatriculaPor: (c.aprobado_matricula_por ?? null) as string | null,
      numero_factura: (c.numero_factura ?? null) as string | null,
      created_at: (c.created_at ?? null) as string | null,
    }

    setLeadsState(prev => [nuevoLead, ...prev.filter(l => l.id !== nuevoLead.id)])
    setTab('kanban')
    setAbrirClienteId(clienteId)
  }, [supabase])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const abrir = params.get('abrir')
    if (abrir) {
      setAbrirClienteId(abrir)
      window.history.replaceState({}, '', '/admin/ventas')
    }
  }, [])

  useEffect(() => {
    supabase
      .from('usuarios')
      .select('id, nombre, email')
      .eq('tenant_id', tenantId)
      .eq('es_asesor', true)
      .order('nombre')
      .then(({ data }) => {
        setUsuarios((data ?? []).map(u => ({
          id: u.id as string,
          nombre: (u.nombre as string | null) || (u.email as string | null) || 'Usuario',
        })))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  useEffect(() => {
    supabase
      .from('entidades_financieras')
      .select('id, nombre')
      .eq('tenant_id', tenantId)
      .eq('activa', true)
      .order('orden')
      .then(({ data }) => {
        setEntidadesCredito((data ?? []).map(e => ({ id: e.id as string, nombre: e.nombre as string })))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const toggleCreditoEstado = useCallback((entidadId: string, estado: string) => {
    setCreditoFiltro(prev => {
      const next = { ...prev }
      const set = new Set(next[entidadId] ?? [])
      if (set.has(estado)) set.delete(estado)
      else set.add(estado)
      if (set.size === 0) delete next[entidadId]
      else next[entidadId] = set
      return next
    })
  }, [])

  // Búsqueda extendida: comentarios + recordatorios (debounced, server-side)
  useEffect(() => {
    const q = busqueda.trim()
    if (q.length < 2) {
      setIdsExtraSearch(new Set())
      setBuscandoExtra(false)
      return
    }
    setBuscandoExtra(true)
    const timer = setTimeout(async () => {
      try {
        const [{ data: comCliente }, { data: comGeneral }, { data: reminders }] = await Promise.all([
          supabase.from('comentarios_cliente').select('cliente_id').eq('tenant_id', tenantId).ilike('texto', `%${q}%`),
          supabase.from('comentarios').select('cliente_id').eq('tenant_id', tenantId).ilike('contenido', `%${q}%`),
          supabase.from('recordatorios').select('cliente_id').eq('tenant_id', tenantId).ilike('nota', `%${q}%`),
        ])
        const ids = new Set<string>()
        for (const r of comCliente  ?? []) if (r.cliente_id) ids.add(r.cliente_id as string)
        for (const r of comGeneral  ?? []) if (r.cliente_id) ids.add(r.cliente_id as string)
        for (const r of reminders   ?? []) if (r.cliente_id) ids.add(r.cliente_id as string)
        setIdsExtraSearch(ids)
      } finally {
        setBuscandoExtra(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, tenantId])

  const activos = useMemo(
    () => leadsState.filter(l => etapasPipeline.etapaMap[l.etapa_venta]?.es_activa),
    [leadsState, etapasPipeline.etapaMap]
  )

  const leadsFiltrados = useMemo(() => {
    let lista = usuariosFiltro.size > 0 ? leadsState.filter(l => usuariosFiltro.has(l.assigned_to ?? '')) : leadsState
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      lista = lista.filter(l =>
        l.cliente?.nombre?.toLowerCase().includes(q) ||
        l.cliente?.celular?.includes(q) ||
        l.cliente_documento?.includes(q) ||
        l.cliente?.placa?.toLowerCase().includes(q) ||
        l.numero_factura?.toLowerCase().includes(q) ||
        l.cliente_email?.toLowerCase().includes(q) ||
        idsExtraSearch.has(l.id)
      )
    }
    if (fechaDesde) {
      const desde = new Date(fechaDesde + 'T00:00:00').getTime()
      lista = lista.filter(l => l.created_at && new Date(l.created_at).getTime() >= desde)
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta + 'T23:59:59.999').getTime()
      lista = lista.filter(l => l.created_at && new Date(l.created_at).getTime() <= hasta)
    }
    const entidadesConFiltro = Object.keys(creditoFiltro)
    if (entidadesConFiltro.length > 0) {
      lista = lista.filter(l => entidadesConFiltro.every(entidadId => {
        const estadoCliente = l.creditoPorEntidad?.[entidadId] ?? 'sin_iniciar'
        return creditoFiltro[entidadId].has(estadoCliente)
      }))
    }
    return lista
  }, [leadsState, usuariosFiltro, busqueda, idsExtraSearch, fechaDesde, fechaHasta, creditoFiltro])

  const sinSeguim = activos.filter(l => !l.proxima_accion_fecha).length

  return (
    <div className="p-5">
      {nuevoOpen && <NuevoClienteForm variant="modal" onClose={() => setNuevoOpen(false)} onCreated={cargarClienteYAbrir} />}
      {whatsappOpen && <WhatsAppCreditoModal leads={leadsState} onClose={() => setWhatsappOpen(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline - Seguimiento Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activos.length} clientes activos
            {sinSeguim > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · ⚠️ {sinSeguim} sin seguimiento
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setNuevoOpen(true)}
            className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
            + Nuevo cliente
          </button>
          <button onClick={() => setWhatsappOpen(true)}
            title="Generar lista de clientes para WhatsApp (estudio de crédito)"
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0">
            📋 Lista WA
          </button>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {([
              { id: 'kanban',  label: 'Kanban' },
              ...(esFreelancer ? [] : [{ id: 'bandeja' as Tab, label: '📥 Bandeja' }]),
              { id: 'hoy',     label: 'Prospectos' },
              { id: 'lista',   label: 'Lista' },
            ] as { id: Tab; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtro por usuario (multi-select) */}
      {usuarios.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-500 font-medium">Asesor:</span>
          <button
            onClick={() => setUsuariosFiltro(new Set())}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
              usuariosFiltro.size === 0
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
            }`}
          >
            Todos
          </button>
          {usuarios.map(u => {
            const activo = usuariosFiltro.has(u.id)
            return (
              <button
                key={u.id}
                onClick={() => setUsuariosFiltro(prev => {
                  const next = new Set(prev)
                  if (next.has(u.id)) next.delete(u.id)
                  else next.add(u.id)
                  return next
                })}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                  activo
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
                }`}
              >
                {u.nombre}
              </button>
            )
          })}
        </div>
      )}

      {/* Filtro por estudio de crédito por entidad */}
      {entidadesCredito.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setCreditoPanelOpen(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              Object.keys(creditoFiltro).length > 0
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
            }`}
          >
            🏦 Estudio de crédito
            {Object.keys(creditoFiltro).length > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {Object.keys(creditoFiltro).length}
              </span>
            )}
            <svg className={`w-3 h-3 transition-transform ${creditoPanelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {creditoPanelOpen && (
            <div className="mt-2 p-3 bg-white border border-gray-200 rounded-xl space-y-3 max-w-xl">
              {entidadesCredito.map(ent => (
                <div key={ent.id}>
                  <p className="text-xs font-semibold text-gray-700 mb-1">{ent.nombre}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ESTADO_CREDITO_OPCIONES.map(op => {
                      const activo = creditoFiltro[ent.id]?.has(op.key) ?? false
                      return (
                        <button
                          key={op.key}
                          onClick={() => toggleCreditoEstado(ent.id, op.key)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${
                            activo
                              ? 'bg-blue-700 text-white border-blue-700'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-700'
                          }`}
                        >
                          {op.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(creditoFiltro).length > 0 && (
                <button onClick={() => setCreditoFiltro({})} className="text-xs text-blue-600 hover:underline">
                  Limpiar filtro de crédito
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Buscador */}
      {tab !== 'bandeja' && (
        <div className="mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-sm flex-1 min-w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Nombre, cédula, celular, placa, correo, comentarios, recordatorios..."
                className="w-full pl-8 pr-8 py-2 border-2 border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
              {busqueda && (
                <button onClick={() => setBusqueda('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
                  ×
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 flex-shrink-0">Agregado:</span>
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                title="Desde"
                className="border-2 border-gray-300 rounded-xl px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white" />
              <span className="text-xs text-gray-400 flex-shrink-0">a</span>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                title="Hasta"
                className="border-2 border-gray-300 rounded-xl px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white" />
              {(fechaDesde || fechaHasta) && (
                <button onClick={() => { setFechaDesde(''); setFechaHasta('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
                  × Limpiar
                </button>
              )}
            </div>

            {tab === 'kanban' && <div ref={setPipelineTabsSlot} className="flex-shrink-0" />}
          </div>
          {busqueda.trim() && (
            <p className="text-xs text-gray-500 mt-1.5 ml-1">
              {buscandoExtra
                ? 'Buscando en comentarios y recordatorios...'
                : leadsFiltrados.length === 0
                  ? 'Sin resultados para esta búsqueda.'
                  : `${leadsFiltrados.length} cliente${leadsFiltrados.length === 1 ? '' : 's'} encontrado${leadsFiltrados.length === 1 ? '' : 's'}`}
            </p>
          )}
          {!busqueda.trim() && (fechaDesde || fechaHasta) && (
            <p className="text-xs text-gray-500 mt-1.5 ml-1">
              {leadsFiltrados.length} cliente{leadsFiltrados.length === 1 ? '' : 's'} agregado{leadsFiltrados.length === 1 ? '' : 's'} en ese rango
            </p>
          )}
        </div>
      )}

      {/* Content */}
      {tab === 'kanban' && (
        <PipelineKanban leadsIniciales={leadsFiltrados} tenantId={tenantId} usuarios={usuarios} abrirClienteId={abrirClienteId ?? undefined} tabsSlot={pipelineTabsSlot} onLeadPatch={patchLead} onLeadRemove={removeLead} etapasPipeline={etapasPipeline} />
      )}
      {tab === 'bandeja' && !esFreelancer && (
        <VistaBandeja leads={leadsFiltrados} tenantId={tenantId} usuarios={usuarios} onLeadPatch={patchLead} onLeadRemove={removeLead} />
      )}
      {tab === 'hoy' && (
        <VistaHoy leads={leadsFiltrados} tenantId={tenantId} onLeadPatch={patchLead} onLeadRemove={removeLead} />
      )}
      {tab === 'lista' && (
        <VistaLista leads={leadsFiltrados} tenantId={tenantId} onLeadPatch={patchLead} onLeadRemove={removeLead} />
      )}
    </div>
  )
}
