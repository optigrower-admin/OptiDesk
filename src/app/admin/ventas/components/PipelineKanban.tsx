'use client'
import { useState, useCallback } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCenter,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { createPortal } from 'react-dom'
import { ETAPAS, ETAPA_MAP, type EtapaVenta } from '@/lib/ventas/pipeline'
import LeadCard, { type LeadData } from './LeadCard'
import FichaProspecto from './FichaProspecto'
import ModalPerdida from './ModalPerdida'

interface Props {
  leadsIniciales: LeadData[]
  tenantId: string
  usuarios?: { id: string; nombre: string }[]
}

function ConfirmMoveModal({
  to,
  onConfirm,
  onCancel,
}: {
  to: typeof ETAPAS[0]
  onConfirm: () => void
  onCancel: () => void
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

// Each column needs to be a proper droppable zone
function KanbanColumn({
  etapaConfig,
  leads,
  onOpen,
  usuariosMap,
}: {
  etapaConfig: typeof ETAPAS[0]
  leads: LeadData[]
  onOpen: (id: string) => void
  usuariosMap: Record<string, string>
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapaConfig.id })

  return (
    <div className={`flex-shrink-0 w-64 rounded-2xl flex flex-col border transition-colors ${
      isOver
        ? `${etapaConfig.border} ring-2 ring-offset-1`
        : 'border-gray-200'
    } bg-white`}>
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: etapaConfig.color }} />
          <span className="font-semibold text-sm text-gray-800">{etapaConfig.label}</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
            {leads.length}
          </span>
          <span className="text-xs text-gray-400 ml-auto">{leads.length === 1 ? '1 cliente' : `${leads.length} clientes`}</span>
        </div>
      </div>

      {/* Cards */}
      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ minHeight: 80 }}>
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
          {leads.length === 0 && (
            <div className={`h-16 border-2 border-dashed rounded-xl flex items-center justify-center transition-colors ${
              isOver ? `border-current opacity-60` : 'border-gray-200'
            }`}>
              <span className="text-xs text-gray-400">Arrastra aquí</span>
            </div>
          )}
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onOpen(lead.id)}
              asignado={lead.assigned_to ? (usuariosMap[lead.assigned_to] ?? undefined) : undefined} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

export default function PipelineKanban({ leadsIniciales, tenantId, usuarios = [] }: Props) {
  const [leads, setLeads]             = useState<LeadData[]>(leadsIniciales)
  const [activeId, setActiveId]       = useState<string | null>(null)
  const [fichaId, setFichaId]         = useState<string | null>(null)
  const [perdidaId, setPerdidaId]     = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{ leadId: string; targetEtapa: typeof ETAPAS[0] } | null>(null)

  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u.nombre]))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const leadsEn = useCallback(
    (etapa: EtapaVenta) => leads.filter(l => l.etapa_venta === etapa),
    [leads]
  )

  const activeLead = activeId ? leads.find(l => l.id === activeId) ?? null : null
  const fichaLead  = fichaId  ? leads.find(l => l.id === fichaId)  ?? null : null

  function moverLead(id: string, nuevaEtapa: EtapaVenta) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, etapa_venta: nuevaEtapa } : l))
  }

  async function persistirEtapa(id: string, etapa: EtapaVenta, motivoPerdida?: string, detallePerdida?: string) {
    const body: Record<string, unknown> = { cliente_id: id, etapa_venta: etapa }
    if (etapa === 'perdido' && motivoPerdida) {
      body.motivo_perdida = motivoPerdida + (detallePerdida ? ` — ${detallePerdida}` : '')
    }
    const res = await fetch('/api/admin/ventas/guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      console.error('[Kanban] Error al guardar etapa:', json.error)
      // Revert optimistic update
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

    const leadId    = active.id as string
    const overId    = over.id as string
    const lead      = leads.find(l => l.id === leadId)
    if (!lead) return

    let targetEtapa: EtapaVenta | null = null
    if (ETAPA_MAP[overId as EtapaVenta]) {
      targetEtapa = overId as EtapaVenta
    } else {
      const targetLead = leads.find(l => l.id === overId)
      targetEtapa = targetLead?.etapa_venta ?? null
    }

    if (!targetEtapa || targetEtapa === lead.etapa_venta) return

    // Always confirm before moving
    const etapaConfig = ETAPA_MAP[targetEtapa]
    setPendingMove({ leadId, targetEtapa: etapaConfig })
  }

  function confirmarMove() {
    if (!pendingMove) return
    const { leadId, targetEtapa } = pendingMove
    moverLead(leadId, targetEtapa.id as EtapaVenta)
    if (targetEtapa.id === 'perdido') {
      setPerdidaId(leadId)
    } else {
      persistirEtapa(leadId, targetEtapa.id as EtapaVenta)
    }
    setPendingMove(null)
  }

  function cancelarMove() {
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

  function handleEtapaChange(id: string, etapa: EtapaVenta) {
    moverLead(id, etapa)
  }

  function handleLeadUpdate(id: string, updates: { proxima_accion?: string | null; proxima_accion_fecha?: string | null; nombre?: string }) {
    setLeads(prev => prev.map(l => {
      if (l.id !== id) return l
      return {
        ...l,
        ...(updates.proxima_accion !== undefined ? { proxima_accion: updates.proxima_accion } : {}),
        ...(updates.proxima_accion_fecha !== undefined ? { proxima_accion_fecha: updates.proxima_accion_fecha } : {}),
        ...(updates.nombre !== undefined && l.cliente ? { cliente: { ...l.cliente, nombre: updates.nombre } } : {}),
      }
    }))
  }

  function handleLeadDelete(id: string) {
    setLeads(prev => prev.filter(l => l.id !== id))
    setFichaId(null)
  }

  return (
    <>
      {pendingMove && (
        <ConfirmMoveModal
          to={pendingMove.targetEtapa}
          onConfirm={confirmarMove}
          onCancel={cancelarMove}
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-220px)]">
          {ETAPAS.map(etapaConfig => (
            <KanbanColumn
              key={etapaConfig.id}
              etapaConfig={etapaConfig}
              leads={leadsEn(etapaConfig.id)}
              onOpen={setFichaId}
              usuariosMap={usuariosMap}
            />
          ))}
        </div>

        {typeof window !== 'undefined' && createPortal(
          <DragOverlay>
            {activeLead && (
              <LeadCard lead={activeLead} onClick={() => {}} overlay />
            )}
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
