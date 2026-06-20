'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
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

function NuevoClienteModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient()
  const [nombre, setNombre]   = useState('')
  const [cedula, setCedula]   = useState('')
  const [celular, setCelular] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]     = useState('')

  async function crear() {
    if (!nombre.trim()) return
    setGuardando(true); setError('')
    try {
      const res = await fetch('/api/admin/clientes/iniciar-seguimiento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), cedula: cedula.trim() || null, celular: celular.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al crear el cliente')
      window.location.reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear el cliente')
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
        <h2 className="font-bold text-gray-900 mb-1">Nuevo cliente en seguimiento</h2>
        <p className="text-xs text-gray-500 mb-4">Para clientes que se gestionan en persona, sin chat previo.</p>
        <div className="space-y-2">
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={cedula} onChange={e => setCedula(e.target.value)} placeholder="Cédula (opcional)"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={celular} onChange={e => setCelular(e.target.value)} placeholder="Celular (opcional)"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={crear} disabled={!nombre.trim() || guardando}
            className="flex-1 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VentasClient({ leadsIniciales, tenantId }: Props) {
  const [tab, setTab] = useState<Tab>('kanban')
  const [nuevoOpen, setNuevoOpen] = useState(false)

  const activos = useMemo(
    () => leadsIniciales.filter(l => ETAPAS_ACTIVAS.includes(l.etapa_venta as typeof ETAPAS_ACTIVAS[0])),
    [leadsIniciales]
  )

  const totalValor   = activos.reduce((s, l) => s + (l.valor_estimado_venta ?? 0), 0)
  const sinSeguim    = activos.filter(l => !l.proxima_accion_fecha).length

  return (
    <div className="p-5">
      {nuevoOpen && <NuevoClienteModal onClose={() => setNuevoOpen(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Seguimiento Ventas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activos.length} clientes activos · {formatCOP(totalValor)} en seguimiento
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
