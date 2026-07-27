'use client'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCenter,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ETAPAS, ETAPA_MAP, ETAPA_ORDEN, type EtapaVenta } from '@/lib/ventas/pipeline'
import LeadCard, { type LeadData } from './LeadCard'
import FichaProspecto from './FichaProspecto'
import ModalPerdida from './ModalPerdida'

// ─── Pipeline definitions ──────────────────────────────────────────────────────

type GrupoConfig = {
  grupoId: string
  grupoLabel: string
  color: string  // hex
  bg: string     // hex
  etapas: EtapaVenta[]
}

const PIPELINE_VENTAS: GrupoConfig[] = [
  {
    grupoId: 'prospectos', grupoLabel: 'Prospectos',
    color: '#2563EB', bg: '#EFF6FF',
    etapas: ['nuevo_mensaje', 'nuevo', 'con_interes', 'con_objecion'],
  },
  {
    grupoId: 'proceso', grupoLabel: 'En Proceso',
    color: '#7C3AED', bg: '#F5F3FF',
    etapas: ['seguimiento', 'buscando_credito', 'en_proceso_credito'],
  },
  {
    grupoId: 'vendida', grupoLabel: 'Vendida/Carta Aprobación',
    color: '#16A34A', bg: '#DCFCE7',
    etapas: ['ganado'],
  },
  {
    grupoId: 'entrega', grupoLabel: 'Entrega',
    color: '#D97706', bg: '#FFFBEB',
    etapas: ['aprobado_matricula', 'en_matricula', 'alistamiento', 'espera_entrega'],
  },
  {
    grupoId: 'entregada', grupoLabel: 'Entregada',
    color: '#15803D', bg: '#ECFDF5',
    etapas: ['entregada'],
  },
  {
    grupoId: 'perdido', grupoLabel: 'Perdido',
    color: '#DC2626', bg: '#FEF2F2',
    etapas: ['perdido'],
  },
]

const PIPELINE_POSTVENTA: GrupoConfig[] = [
  {
    grupoId: 'revisiones', grupoLabel: 'Post-Venta',
    color: '#4338CA', bg: '#EEF2FF',
    etapas: ['primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado'],
  },
]

// Flujo de avance (omite demo y negociacion para "Siguiente etapa")
const FLUJO_AVANCE: EtapaVenta[] = [
  'nuevo_mensaje', 'nuevo', 'con_interes', 'con_objecion',
  'seguimiento', 'buscando_credito', 'en_proceso_credito',
  'ganado', 'aprobado_matricula', 'en_matricula',
  'alistamiento', 'espera_entrega', 'entregada',
  'primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado',
]

function nextEtapa(etapa: EtapaVenta): EtapaVenta | null {
  const idx = FLUJO_AVANCE.indexOf(etapa)
  if (idx === -1 || idx >= FLUJO_AVANCE.length - 1) return null
  return FLUJO_AVANCE[idx + 1]
}

// ─── KanbanColumn ──────────────────────────────────────────────────────────────

function KanbanColumn({ etapaConfig, leads, onOpen, usuariosMap, tenantId, usuarioId, onQuickDone, onQuickNote, onQuickReminder, onQuickNext, grupoBg }: {
  etapaConfig: typeof ETAPAS[0]
  leads: LeadData[]
  onOpen: (id: string) => void
  usuariosMap: Record<string, string>
  tenantId: string
  usuarioId: string
  onQuickDone: (id: string) => void
  onQuickNote: (id: string, text: string) => void
  onQuickReminder: (id: string, nota: string, fecha: string) => void
  onQuickNext: (id: string) => void
  grupoBg?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapaConfig.id })
  return (
    <div className={`flex-shrink-0 w-60 rounded-2xl flex flex-col border-2 transition-colors bg-white h-full ${
      isOver ? `${etapaConfig.border} ring-2 ring-offset-1` : etapaConfig.border
    }`}>
      <div className={`px-3 pt-3 pb-2 border-b border-gray-100 rounded-t-2xl flex-shrink-0 ${etapaConfig.bg}`}
        style={grupoBg ? { background: grupoBg } : {}}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: etapaConfig.color }} />
          <span className="font-semibold text-xs text-gray-800 truncate">{etapaConfig.label}</span>
          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium ml-auto">{leads.length}</span>
        </div>
      </div>
      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 overflow-y-auto min-h-0">
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.length === 0 && (
            <div className={`h-12 border-2 border-dashed rounded-xl flex items-center justify-center transition-colors ${
              isOver ? 'border-current opacity-60' : 'border-gray-200'
            }`}>
              <span className="text-[10px] text-gray-400">Arrastra aquí</span>
            </div>
          )}
          {leads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onClick={() => onOpen(lead.id)}
              asignado={lead.assigned_to ? (usuariosMap[lead.assigned_to] ?? undefined) : undefined}
              tenantId={tenantId}
              usuarioId={usuarioId}
              onQuickDone={() => onQuickDone(lead.id)}
              onQuickNote={(t) => onQuickNote(lead.id, t)}
              onQuickReminder={(n, f) => onQuickReminder(lead.id, n, f)}
              onQuickNext={() => onQuickNext(lead.id)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

// ─── ConfirmMoveModal ──────────────────────────────────────────────────────────

function ConfirmMoveModal({ to, onConfirm, onCancel }: {
  to: typeof ETAPAS[0]; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-2">¿Cambiar etapa?</h2>
        <p className="text-sm text-gray-600 mb-5">
          ¿Mover a{' '}
          <span className="font-semibold" style={{ color: to.color }}>{to.label}</span>?
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2 text-white rounded-lg text-sm font-semibold"
            style={{ background: to.color }}>
            Sí, mover
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  leadsIniciales: LeadData[]
  tenantId: string
  usuarios?: { id: string; nombre: string }[]
  abrirClienteId?: string
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function PipelineKanban({ leadsIniciales, tenantId, usuarios = [], abrirClienteId }: Props) {
  const supabase = createClient()
  const { profile } = useAuth()
  const [leads, setLeads]             = useState<LeadData[]>(leadsIniciales)
  const [activeId, setActiveId]       = useState<string | null>(null)
  const [fichaId, setFichaId]         = useState<string | null>(null)
  const [perdidaId, setPerdidaId]     = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{ leadId: string; targetEtapa: typeof ETAPAS[0] } | null>(null)
  const [bloqueoMsg, setBloqueoMsg]   = useState<string | null>(null)
  const [activePipeline, setActivePipeline] = useState<'ventas' | 'postventa'>('ventas')

  // Keep local leads in sync with filtered leadsIniciales from parent
  const lastIniciales = useRef<LeadData[]>(leadsIniciales)
  useEffect(() => {
    if (lastIniciales.current !== leadsIniciales) {
      lastIniciales.current = leadsIniciales
      setLeads(leadsIniciales)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadsIniciales])

  useEffect(() => {
    if (abrirClienteId && leads.some(l => l.id === abrirClienteId)) setFichaId(abrirClienteId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirClienteId])

  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u.nombre]))
  const sensors     = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Mapa pre-indexado: O(N) una vez, luego O(1) por columna en cada render
  const leadsByEtapa = useMemo(() => {
    const map = new Map<EtapaVenta, LeadData[]>()
    for (const l of leads) {
      if (!map.has(l.etapa_venta)) map.set(l.etapa_venta, [])
      map.get(l.etapa_venta)!.push(l)
    }
    return map
  }, [leads])
  const leadsEn     = useCallback((etapa: EtapaVenta) => leadsByEtapa.get(etapa) ?? [], [leadsByEtapa])

  const activeLead  = activeId ? leads.find(l => l.id === activeId) ?? null : null
  const fichaLead   = fichaId  ? leads.find(l => l.id === fichaId)  ?? null : null

  function moverLead(id: string, nuevaEtapa: EtapaVenta) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, etapa_venta: nuevaEtapa } : l))
  }

  async function persistirEtapa(id: string, etapa: EtapaVenta, motivoPerdida?: string, detallePerdida?: string) {
    const body: Record<string, unknown> = { cliente_id: id, etapa_venta: etapa, etapa_venta_orden: ETAPA_ORDEN[etapa] }
    if (etapa === 'perdido' && motivoPerdida) body.motivo_perdida = motivoPerdida + (detallePerdida ? ` — ${detallePerdida}` : '')
    const res = await fetch('/api/admin/ventas/guardar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      console.error('[Kanban] Error al guardar etapa:', json.error)
      const original = leadsIniciales.find(l => l.id === id)?.etapa_venta ?? 'nuevo'
      moverLead(id, original)
    }
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return
    const leadId = active.id as string
    const overId = over.id as string
    const lead   = leads.find(l => l.id === leadId)
    if (!lead) return
    let targetEtapa: EtapaVenta | null = null
    if (ETAPA_MAP[overId as EtapaVenta]) {
      targetEtapa = overId as EtapaVenta
    } else {
      const targetLead = leads.find(l => l.id === overId)
      targetEtapa = targetLead?.etapa_venta ?? null
    }
    if (!targetEtapa || targetEtapa === lead.etapa_venta) return
    if (ETAPA_ORDEN[targetEtapa] > ETAPA_ORDEN['aprobado_matricula'] &&
        lead.estadoAprobacionMatricula !== 'aprobado') {
      setBloqueoMsg('Debes pedir aprobación para matricular para poder cambiar de etapa')
      return
    }
    setPendingMove({ leadId, targetEtapa: ETAPA_MAP[targetEtapa] })
  }

  function confirmarMove() {
    if (!pendingMove) return
    const { leadId, targetEtapa } = pendingMove
    moverLead(leadId, targetEtapa.id as EtapaVenta)
    if (targetEtapa.id === 'perdido') setPerdidaId(leadId)
    else persistirEtapa(leadId, targetEtapa.id as EtapaVenta)
    setPendingMove(null)
  }

  function confirmarPerdida(motivo: string, detalle: string) {
    if (!perdidaId) return
    persistirEtapa(perdidaId, 'perdido', motivo, detalle)
    setPerdidaId(null)
  }

  function cancelarPerdida() {
    if (perdidaId) {
      const original = leadsIniciales.find(l => l.id === perdidaId)?.etapa_venta ?? 'nuevo'
      moverLead(perdidaId, original)
    }
    setPerdidaId(null)
  }

  function handleEtapaChange(id: string, etapa: EtapaVenta) { moverLead(id, etapa) }

  function handleLeadUpdate(id: string, updates: {
    proxima_accion?: string | null; proxima_accion_fecha?: string | null
    nombre?: string; nombre_pendiente_aprobacion?: boolean | null
    etiquetas?: { id: string; nombre: string; color: string }[]
    placa?: string | null; celular?: string | null
    numero_carta_negociacion?: string | null
    numero_factura?: string | null; assigned_to?: string | null
    alistamientoOrdenId?: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }) {
    setLeads(prev => prev.map(l => {
      if (l.id !== id) return l
      const clientePatch: Record<string, unknown> = {}
      if (updates.nombre  !== undefined) clientePatch.nombre  = updates.nombre
      if (updates.celular !== undefined) clientePatch.celular = updates.celular
      if (updates.placa   !== undefined) clientePatch.placa   = updates.placa
      return {
        ...l,
        ...(updates.proxima_accion              !== undefined ? { proxima_accion: updates.proxima_accion }                             : {}),
        ...(updates.proxima_accion_fecha        !== undefined ? { proxima_accion_fecha: updates.proxima_accion_fecha }                 : {}),
        ...(updates.nombre_pendiente_aprobacion !== undefined ? { nombre_pendiente_aprobacion: updates.nombre_pendiente_aprobacion }   : {}),
        ...(updates.etiquetas                   !== undefined ? { etiquetas: updates.etiquetas }                                       : {}),
        ...(updates.numero_carta_negociacion     !== undefined ? { numero_carta_negociacion: updates.numero_carta_negociacion }         : {}),
        ...(updates.numero_factura              !== undefined ? { numero_factura: updates.numero_factura }                             : {}),
        ...(updates.assigned_to                 !== undefined ? { assigned_to: updates.assigned_to }                                   : {}),
        ...(updates.alistamientoOrdenId         !== undefined ? { alistamientoOrdenId: updates.alistamientoOrdenId, tieneAlistamiento: updates.alistamientoOrdenId !== null } : {}),
        ...(updates.placa !== undefined ? { tienePlaca: !!updates.placa } : {}),
        ...(updates.estadoAprobacionMatricula  !== undefined ? { estadoAprobacionMatricula: updates.estadoAprobacionMatricula } : {}),
        ...(updates.aprobadoMatriculaPor       !== undefined ? { aprobadoMatriculaPor: updates.aprobadoMatriculaPor }           : {}),
        ...(updates.creditoAprobadoEntidad     !== undefined ? { creditoAprobadoEntidad: updates.creditoAprobadoEntidad }       : {}),
        ...(updates.creditoRechazadoEntidades  !== undefined ? { creditoRechazadoEntidades: updates.creditoRechazadoEntidades } : {}),
        ...(l.cliente && Object.keys(clientePatch).length > 0 ? { cliente: { ...l.cliente, ...clientePatch } } : {}),
      }
    }))
  }

  function handleLeadDelete(id: string) { setLeads(prev => prev.filter(l => l.id !== id)); setFichaId(null) }

  async function handleQuickDone(leadId: string) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, proxima_accion: null, proxima_accion_fecha: null } : l))
    await supabase.from('clientes').update({ proxima_accion: null, proxima_accion_fecha: null }).eq('id', leadId)
  }

  async function handleQuickNote(leadId: string, text: string) {
    if (!text.trim() || !profile?.id) return
    const lead = leads.find(l => l.id === leadId)
    if (!lead?.cliente?.id) return
    await supabase.from('comentarios').insert({
      cliente_id: lead.cliente.id,
      tenant_id: tenantId,
      usuario_id: profile.id,
      contenido: text.trim(),
      tipo: 'nota_interna',
    })
  }

  async function handleQuickReminder(leadId: string, nota: string, fecha: string) {
    if (!fecha || !profile?.id) return
    const lead = leads.find(l => l.id === leadId)
    if (!lead?.cliente?.id) return
    await supabase.from('recordatorios').insert({
      cliente_id: lead.cliente.id,
      tenant_id: tenantId,
      asignado_a: profile.id,
      nota: nota || null,
      fecha_recordatorio: new Date(fecha).toISOString(),
      completado: false,
    })
  }

  function handleQuickNext(leadId: string) {
    const lead = leads.find(l => l.id === leadId)
    if (!lead) return
    const next = nextEtapa(lead.etapa_venta)
    if (!next) return
    setPendingMove({ leadId, targetEtapa: ETAPA_MAP[next] })
  }

  const colCallbacks = {
    tenantId,
    usuarioId: profile?.id ?? '',
    onQuickDone: handleQuickDone,
    onQuickNote: handleQuickNote,
    onQuickReminder: handleQuickReminder,
    onQuickNext: handleQuickNext,
  }

  const pipeline = activePipeline === 'ventas' ? PIPELINE_VENTAS : PIPELINE_POSTVENTA

  // Counts for tab labels
  const etapasVentas   = new Set<EtapaVenta>(PIPELINE_VENTAS.flatMap(g => g.etapas))
  const etapasPostventa = new Set<EtapaVenta>(PIPELINE_POSTVENTA.flatMap(g => g.etapas))
  const cntVentas    = leads.filter(l => etapasVentas.has(l.etapa_venta)).length
  const cntPostventa = leads.filter(l => etapasPostventa.has(l.etapa_venta)).length

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Pipeline tab switcher (shared between mobile and desktop) ──
  const PipelineTabs = (
    <div className="flex items-center gap-0 mb-3 bg-white border border-gray-200 rounded-xl overflow-hidden w-fit shadow-sm">
      {([
        { key: 'ventas',    label: 'Pipeline Ventas',     count: cntVentas,    color: '#2563EB' },
        { key: 'postventa', label: 'Pipeline Post-Venta', count: cntPostventa, color: '#4338CA' },
      ] as const).map(tab => (
        <button
          key={tab.key}
          onClick={() => setActivePipeline(tab.key)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            activePipeline === tab.key ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
          style={activePipeline === tab.key ? { background: tab.color } : {}}
        >
          {tab.label}
          <span className={`text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${
            activePipeline === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
          }`}>
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  )

  // ── Mobile view ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {fichaLead && (
          <FichaProspecto
            key={fichaLead.id}
            lead={fichaLead}
            tenantId={tenantId}
            onClose={() => setFichaId(null)}
            onEtapaChange={handleEtapaChange}
            onLeadUpdate={handleLeadUpdate}
            onLeadDelete={handleLeadDelete}
          />
        )}
        {pendingMove && (
          <ConfirmMoveModal to={pendingMove.targetEtapa} onConfirm={confirmarMove} onCancel={() => setPendingMove(null)} />
        )}
        {perdidaId && (
          <ModalPerdida tenantId={tenantId} onConfirm={confirmarPerdida} onCancel={cancelarPerdida} />
        )}

        {PipelineTabs}

        {activePipeline === 'postventa' && (
          <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3">
            Clientes entregados en revisiones de mantenimiento (1era, 2da, 3cera).
          </p>
        )}

        <div className="space-y-4 pb-8">
          {pipeline.map(grupo => {
            const grupoLeads = grupo.etapas.flatMap(e => leads.filter(l => l.etapa_venta === e))
            if (grupoLeads.length === 0) return null
            return (
              <div key={grupo.grupoId}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2"
                  style={{ background: grupo.bg, borderLeft: `4px solid ${grupo.color}` }}>
                  <span className="text-sm font-bold" style={{ color: grupo.color }}>{grupo.grupoLabel}</span>
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                    style={{ background: grupo.color + '22', color: grupo.color }}>{grupoLeads.length}</span>
                </div>
                <div className="space-y-2">
                  {grupoLeads.map(lead => {
                    const asignado = lead.assigned_to ? (usuariosMap[lead.assigned_to] ?? null) : null
                    const dias = lead.updated_at
                      ? Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86_400_000)
                      : null
                    return (
                      <div key={lead.id}
                        onClick={() => setFichaId(lead.id)}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 cursor-pointer active:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <p className="font-semibold text-sm text-gray-900 truncate">
                            {lead.cliente?.nombre ?? 'Sin nombre'}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {dias !== null && dias > 2 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                dias <= 5 ? 'bg-amber-100 text-amber-700' :
                                dias <= 9 ? 'bg-orange-100 text-orange-700' :
                                dias <= 14 ? 'bg-red-100 text-red-700' :
                                'bg-red-600 text-white animate-pulse'
                              }`}>🕐 {dias}d</span>
                            )}
                            {lead.no_leidos_count > 0 && (
                              <span className="w-5 h-5 bg-green-500 text-white rounded-full text-xs flex items-center justify-center font-bold">
                                {lead.no_leidos_count > 9 ? '9+' : lead.no_leidos_count}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white"
                            style={{ background: ETAPA_MAP[lead.etapa_venta].color }}>
                            {ETAPA_MAP[lead.etapa_venta].label}
                          </span>
                          {asignado && <span className="text-[10px] text-gray-500">{asignado}</span>}
                          {lead.moto_interes && (
                            <span className="text-[10px] text-gray-400 truncate max-w-[120px]">🏍️ {lead.moto_interes}</span>
                          )}
                        </div>
                        {lead.proxima_accion && (
                          <p className="text-[11px] text-blue-600 font-medium mt-1 truncate">📌 {lead.proxima_accion}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          {pipeline.flatMap(g => g.etapas).every(e => !leads.some(l => l.etapa_venta === e)) && (
            <p className="text-sm text-gray-400 text-center py-8">Sin leads en este pipeline</p>
          )}
        </div>
      </>
    )
  }

  return (
    <>
      {pendingMove && (
        <ConfirmMoveModal
          to={pendingMove.targetEtapa}
          onConfirm={confirmarMove}
          onCancel={() => setPendingMove(null)}
        />
      )}

      {PipelineTabs}

      {/* Post-Venta hint */}
      {activePipeline === 'postventa' && (
        <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-3 w-fit">
          Muestra clientes entregados activos en revisiones de mantenimiento (1era, 2da, 3cera).
          Pasa un cliente a revisión desde la columna <strong>Entregada</strong> en el pipeline Ventas.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-5 overflow-x-auto pb-4 h-[calc(100vh-250px)] items-start">
          {pipeline.map(grupo => {
            const totalGrupo = grupo.etapas.reduce((s, e) => s + leadsEn(e).length, 0)
            return (
              <div key={grupo.grupoId} className="flex flex-col gap-2 flex-shrink-0 h-full">
                {/* Group banner */}
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: grupo.bg, borderLeft: `4px solid ${grupo.color}` }}
                >
                  <span className="text-xs font-bold" style={{ color: grupo.color }}>
                    {grupo.grupoLabel}
                  </span>
                  <span
                    className="text-[10px] font-bold rounded-full px-1.5 py-0.5 ml-1"
                    style={{ background: grupo.color + '22', color: grupo.color }}
                  >
                    {totalGrupo}
                  </span>
                </div>
                {/* Columns */}
                <div className="flex gap-3 flex-1 min-h-0">
                  {grupo.etapas.map(etapa => (
                    <KanbanColumn
                      key={etapa}
                      etapaConfig={ETAPA_MAP[etapa]}
                      leads={leadsEn(etapa)}
                      onOpen={setFichaId}
                      usuariosMap={usuariosMap}
                      grupoBg={grupo.bg}
                      {...colCallbacks}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {typeof window !== 'undefined' && createPortal(
          <DragOverlay>
            {activeLead && <LeadCard lead={activeLead} onClick={() => {}} overlay />}
          </DragOverlay>,
          document.body
        )}
      </DndContext>

      {fichaLead && (
        <FichaProspecto
          key={fichaLead.id}
          lead={fichaLead}
          tenantId={tenantId}
          onClose={() => setFichaId(null)}
          onEtapaChange={handleEtapaChange}
          onLeadUpdate={handleLeadUpdate}
          onLeadDelete={handleLeadDelete}
        />
      )}

      {perdidaId && (
        <ModalPerdida
          tenantId={tenantId}
          onConfirm={confirmarPerdida}
          onCancel={cancelarPerdida}
        />
      )}

      {/* Modal de bloqueo: matrícula no aprobada */}
      {bloqueoMsg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">🔒</span>
              <h2 className="font-bold text-gray-900 text-base">Acción bloqueada</h2>
            </div>
            <p className="text-sm text-gray-600 mb-5">{bloqueoMsg}</p>
            <button onClick={() => setBloqueoMsg(null)}
              className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  )
}
