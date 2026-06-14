'use client'
import { useState, useMemo } from 'react'
import { ETAPAS_ACTIVAS, formatCOP } from '@/lib/ventas/pipeline'
import type { LeadData } from './components/LeadCard'
import PipelineKanban from './components/PipelineKanban'
import VistaHoy from './components/VistaHoy'
import VistaLista from './components/VistaLista'

type Tab = 'kanban' | 'hoy' | 'lista'

interface Props {
  leadsIniciales: LeadData[]
  tenantId: string
}

export default function VentasClient({ leadsIniciales, tenantId }: Props) {
  const [tab, setTab] = useState<Tab>('kanban')

  const activos = useMemo(
    () => leadsIniciales.filter(l => ETAPAS_ACTIVAS.includes(l.etapa_venta as typeof ETAPAS_ACTIVAS[0])),
    [leadsIniciales]
  )

  const totalValor   = activos.reduce((s, l) => s + (l.valor_estimado_venta ?? 0), 0)
  const sinSeguim    = activos.filter(l => !l.proxima_accion_fecha).length

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline de Ventas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activos.length} prospectos activos · {formatCOP(totalValor)} en pipeline
            {sinSeguim > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · ⚠️ {sinSeguim} sin seguimiento
              </span>
            )}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {([
            { id: 'kanban', label: 'Kanban' },
            { id: 'hoy',    label: 'Hoy' },
            { id: 'lista',  label: 'Lista' },
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

      {/* Content */}
      {tab === 'kanban' && (
        <PipelineKanban leadsIniciales={leadsIniciales} tenantId={tenantId} />
      )}
      {tab === 'hoy' && (
        <VistaHoy leads={activos} tenantId={tenantId} />
      )}
      {tab === 'lista' && (
        <VistaLista leads={leadsIniciales} tenantId={tenantId} />
      )}
    </div>
  )
}
