'use client'
import { useState, useCallback } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCenter,
  useDroppable,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { createPortal } from 'react-dom'
import { ETAPAS, ETAPA_MAP, formatCOP, type EtapaVenta } from '@/lib/ventas/pipeline'
import LeadCard, { type LeadData } from './LeadCard'
import FichaProspecto from './FichaProspecto'
import ModalPerdida from './ModalPerdida'

interface Props {
  leadsIniciales: LeadData[]
  tenantId: string
}

// Each column needs to be a proper droppable zone
function KanbanColumn({
  etapaConfig,
  leads,
  onOpen,
}: {
  etapaConfig: typeof ETAPAS[0]
  leads: LeadData[]
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapaConfig.id })
  const valor = leads.reduce((s, l) => s + (l.valor_estimado_venta ?? 0), 0)

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
        </div>
        {valor > 0 && (
          <p className="text-xs text-gray-400 mt-0.5 ml-4">{formatCOP(valor)}</p>
        )}
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
            <LeadCard key={lead.id} lead={lead} onClick={() => onOpen(lead.id)} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

export default function PipelineKanban({ leadsIniciales, tenantId }: Props) {
  const [leads, setLeads]             = useState<LeadData[]>(leadsIniciales)
  const [activeId, setActiveId]       = useState<string | null>(null)
  const [fichaId, setFichaId]         = useState<string | null>(null)
  const [perdidaId, setPerdidaId]     = useState<string | null>(null)

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
    const body: Record<string, unknown> = { conversacion_id: id, etapa_venta: etapa }
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

    // `over.id` is either a column etapa or another card's id
    let targetEtapa: EtapaVenta | null = null
    if (ETAPA_MAP[overId as EtapaVenta]) {
      // Dropped directly on a column
      targetEtapa = overId as EtapaVenta
    } else {
      // Dropped on a card — use that card's column
      const targetLead = leads.find(l => l.id === overId)
      targetEtapa = targetLead?.etapa_venta ?? null
    }

    if (!targetEtapa || targetEtapa === lead.etapa_venta) return

    // Optimistic move
    moverLead(leadId, targetEtapa)

    if (targetEtapa === 'perdido') {
      setPerdidaId(leadId)
      // Persist happens after modal confirmation
    } else {
      persistirEtapa(leadId, targetEtapa)
    }
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

  return (
    <>
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
