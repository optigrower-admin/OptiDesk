'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
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

/* ─── Fases ──────────────────────────────────────────────────────────────────── */
const FASES_KANBAN: {
  id: string; label: string; color: string; bg: string; border: string
  etapas: EtapaVenta[]
}[] = [
  {
    id: 'prospectos', label: 'Prospectos', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE',
    etapas: ['nuevo_mensaje', 'nuevo', 'con_interes', 'con_objecion'],
  },
  {
    id: 'en_proceso', label: 'En proceso', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE',
    etapas: ['propuesta', 'demo', 'seguimiento', 'buscando_credito', 'en_proceso_credito', 'negociacion'],
  },
  {
    id: 'vendido', label: 'Vendido', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0',
    etapas: ['ganado', 'aprobado_matricula', 'en_matricula'],
  },
  {
    id: 'entrega', label: 'Entrega', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A',
    etapas: ['alistamiento', 'espera_entrega'],
  },
  {
    id: 'revisiones', label: 'Revisiones', color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE',
    etapas: ['entregada', 'primera_revision', 'segunda_revision', 'tercera_revision'],
  },
  {
    id: 'finalizado', label: 'Finalizado', color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB',
    etapas: ['proceso_finalizado'],
  },
  {
    id: 'perdido', label: 'Perdido', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA',
    etapas: ['perdido'],
  },
]

// Orden lógico del flujo de ventas (para avanzar etapa)
const FLUJO_ORDEN: EtapaVenta[] = [
  'nuevo_mensaje', 'nuevo', 'con_interes', 'con_objecion',
  'propuesta', 'demo', 'seguimiento', 'buscando_credito', 'en_proceso_credito',
  'negociacion', 'ganado', 'aprobado_matricula', 'en_matricula',
  'alistamiento', 'espera_entrega', 'entregada',
  'primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado',
]

function nextEtapa(etapa: EtapaVenta): EtapaVenta | null {
  const idx = FLUJO_ORDEN.indexOf(etapa)
  if (idx === -1 || idx >= FLUJO_ORDEN.length - 1) return null
  return FLUJO_ORDEN[idx + 1]
}

/* ─── Sub-componentes ─────────────────────────────────────────────────────────── */
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

function KanbanColumn({ etapaConfig, leads, onOpen, usuariosMap, tenantId, usuarioId, onQuickDone, onQuickNote, onQuickReminder, onQuickNext }: {
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
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapaConfig.id })
  return (
    <div className={`flex-shrink-0 w-60 rounded-2xl flex flex-col border-2 transition-colors bg-white h-full ${
      isOver ? `${etapaConfig.border} ring-2 ring-offset-1` : etapaConfig.border
    }`}>
      <div className={`px-3 pt-3 pb-2 border-b border-gray-100 rounded-t-2xl flex-shrink-0 ${etapaConfig.bg}`}>
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

/* Fase colapsada — tarjeta resumen */
function FaseCard({ fase, leads, onExpand, usuariosMap, onOpenLead }: {
  fase: typeof FASES_KANBAN[0]
  leads: LeadData[]
  onExpand: () => void
  usuariosMap: Record<string, string>
  onOpenLead: (id: string) => void
}) {
  const conAlerta = leads.filter(l =>
    l.tieneAlistamiento === false || l.tienePlaca === false ||
    (l.sin_respuesta_asesor_desde && (Date.now() - new Date(l.sin_respuesta_asesor_desde).getTime()) > 15 * 60000)
  )
  const noLeidos = leads.reduce((s, l) => s + l.no_leidos_count, 0)
  const urgentes = leads.filter(l => l.proxima_accion_fecha && new Date(l.proxima_accion_fecha) < new Date())
  const top4 = [...leads].sort((a, b) => {
    const urgA = a.sin_respuesta_asesor_desde ? Date.now() - new Date(a.sin_respuesta_asesor_desde).getTime() : 0
    const urgB = b.sin_respuesta_asesor_desde ? Date.now() - new Date(b.sin_respuesta_asesor_desde).getTime() : 0
    return urgB - urgA
  }).slice(0, 4)

  return (
    <div className="flex-shrink-0 w-44 rounded-2xl flex flex-col border-2 bg-white overflow-hidden"
      style={{ borderColor: fase.color }}>
      {/* Header */}
      <div className="px-3 pt-3 pb-2" style={{ background: fase.bg }}>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fase.color }} />
          <span className="font-bold text-xs" style={{ color: fase.color }}>{fase.label}</span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-black leading-none" style={{ color: fase.color }}>{leads.length}</span>
          <div className="flex flex-col gap-0.5 pb-0.5">
            {noLeidos > 0   && <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 rounded-full">📱 {noLeidos}</span>}
            {urgentes.length > 0 && <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 rounded-full">⏰ {urgentes.length}</span>}
            {conAlerta.length > 0 && <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 rounded-full">⚠ {conAlerta.length}</span>}
          </div>
        </div>
      </div>

      {/* Mini client list */}
      {top4.length > 0 && (
        <div className="px-2 py-1.5 space-y-1 border-b border-gray-100">
          {top4.map(l => (
            <button key={l.id} onClick={() => onOpenLead(l.id)}
              className="w-full text-left px-2 py-1 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition-colors">
              {l.no_leidos_count > 0 && (
                <span className="w-3.5 h-3.5 bg-green-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold flex-shrink-0">
                  {l.no_leidos_count > 9 ? '9+' : l.no_leidos_count}
                </span>
              )}
              <span className="text-[11px] font-medium text-gray-800 truncate flex-1">
                {l.cliente?.nombre ?? 'Sin nombre'}
              </span>
            </button>
          ))}
          {leads.length > 4 && (
            <p className="text-[10px] text-gray-400 text-center">+{leads.length - 4} más</p>
          )}
        </div>
      )}
      {leads.length === 0 && (
        <div className="px-3 py-4 text-center text-[10px] text-gray-400">Sin clientes</div>
      )}

      {/* Expand button */}
      <button onClick={onExpand}
        className="w-full py-2 text-[11px] font-bold transition-colors hover:opacity-80"
        style={{ color: fase.color, background: fase.bg }}>
        Ver columnas ▼
      </button>
    </div>
  )
}

/* ─── Props ───────────────────────────────────────────────────────────────────── */
interface Props {
  leadsIniciales: LeadData[]
  tenantId: string
  usuarios?: { id: string; nombre: string }[]
  abrirClienteId?: string
}

/* ─── Componente principal ────────────────────────────────────────────────────── */
export default function PipelineKanban({ leadsIniciales, tenantId, usuarios = [], abrirClienteId }: Props) {
  const supabase = createClient()
  const { profile } = useAuth()
  const [leads, setLeads]             = useState<LeadData[]>(leadsIniciales)
  const [activeId, setActiveId]       = useState<string | null>(null)
  const [fichaId, setFichaId]         = useState<string | null>(null)
  const [perdidaId, setPerdidaId]     = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{ leadId: string; targetEtapa: typeof ETAPAS[0] } | null>(null)
  const [fasesExpandidas, setFasesExpandidas] = useState<Set<string>>(new Set())
  const fasesPreDragRef = useRef<Set<string> | null>(null)

  // Sincronizar carga inicial: cuando VentasPage termina de cargar y pasa los leads
  // reales por primera vez, los internalizamos. Recargas de fondo no tocan este estado.
  useEffect(() => {
    if (leads.length === 0 && leadsIniciales.length > 0) {
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
  const leadsEn     = useCallback((etapa: EtapaVenta) => leads.filter(l => l.etapa_venta === etapa), [leads])
  const activeLead  = activeId ? leads.find(l => l.id === activeId) ?? null : null
  const fichaLead   = fichaId  ? leads.find(l => l.id === fichaId)  ?? null : null

  function toggleFase(faseId: string) {
    setFasesExpandidas(prev => {
      const next = new Set(prev)
      next.has(faseId) ? next.delete(faseId) : next.add(faseId)
      return next
    })
  }

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
    fasesPreDragRef.current = new Set(fasesExpandidas)
    setFasesExpandidas(new Set(FASES_KANBAN.map(f => f.id)))
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (fasesPreDragRef.current !== null) {
      setFasesExpandidas(fasesPreDragRef.current)
      fasesPreDragRef.current = null
    }
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
        ...(updates.numero_factura              !== undefined ? { numero_factura: updates.numero_factura }                             : {}),
        ...(updates.assigned_to                 !== undefined ? { assigned_to: updates.assigned_to }                                   : {}),
        ...(updates.alistamientoOrdenId         !== undefined ? { alistamientoOrdenId: updates.alistamientoOrdenId, tieneAlistamiento: updates.alistamientoOrdenId !== null } : {}),
        ...(updates.placa !== undefined ? { tienePlaca: !!updates.placa } : {}),
        ...(updates.creditoAprobadoEntidad     !== undefined ? { creditoAprobadoEntidad: updates.creditoAprobadoEntidad }       : {}),
        ...(updates.creditoRechazadoEntidades  !== undefined ? { creditoRechazadoEntidades: updates.creditoRechazadoEntidades } : {}),
        ...(l.cliente && Object.keys(clientePatch).length > 0 ? { cliente: { ...l.cliente, ...clientePatch } } : {}),
      }
    }))
  }

  function handleLeadDelete(id: string) { setLeads(prev => prev.filter(l => l.id !== id)); setFichaId(null) }

  /* ── Quick actions desde hover ─── */
  async function handleQuickDone(leadId: string) {
    const lead = leads.find(l => l.id === leadId)
    if (!lead) return
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

  return (
    <>
      {pendingMove && (
        <ConfirmMoveModal
          to={pendingMove.targetEtapa}
          onConfirm={confirmarMove}
          onCancel={() => setPendingMove(null)}
        />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 h-[calc(100vh-200px)]">
          {FASES_KANBAN.map(fase => {
            const leadsEnFase  = leads.filter(l => fase.etapas.includes(l.etapa_venta))
            const expandida    = fasesExpandidas.has(fase.id)

            if (expandida) {
              return (
                <div key={fase.id} className="flex-shrink-0 flex flex-col gap-2 h-full">
                  {/* Barra de fase expandida */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border flex-shrink-0"
                    style={{ background: fase.bg, borderColor: fase.border }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: fase.color }} />
                    <span className="font-bold text-xs" style={{ color: fase.color }}>{fase.label}</span>
                    <span className="text-[10px] text-gray-500 ml-1">({leadsEnFase.length})</span>
                    <button onClick={() => toggleFase(fase.id)}
                      className="ml-auto text-[11px] font-semibold hover:opacity-70 transition-opacity"
                      style={{ color: fase.color }}>
                      ▲ Colapsar
                    </button>
                  </div>
                  {/* Columnas individuales */}
                  <div className="flex gap-3 flex-1 min-h-0">
                    {fase.etapas.map(etapa => (
                      <KanbanColumn
                        key={etapa}
                        etapaConfig={ETAPA_MAP[etapa]}
                        leads={leadsEn(etapa)}
                        onOpen={setFichaId}
                        usuariosMap={usuariosMap}
                        {...colCallbacks}
                      />
                    ))}
                  </div>
                </div>
              )
            }

            return (
              <FaseCard
                key={fase.id}
                fase={fase}
                leads={leadsEnFase}
                onExpand={() => toggleFase(fase.id)}
                usuariosMap={usuariosMap}
                onOpenLead={setFichaId}
              />
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
    </>
  )
}
