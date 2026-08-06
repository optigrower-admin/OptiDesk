'use client'
import { useState, useEffect, useCallback } from 'react'
import { ETAPA_MAP, tiempoSinResponder, estadoSeguimiento, formatCOP, type EtapaVenta } from '@/lib/ventas/pipeline'
import type { LeadData } from './LeadCard'
import FichaProspecto from './FichaProspecto'
import { useEtapasPipeline } from '@/hooks/useEtapasPipeline'

interface Props {
  leads: LeadData[]
  tenantId: string
  onLeadPatch?: (id: string, patch: Record<string, unknown>) => void
  onLeadRemove?: (id: string) => void
}

type Prioridad = { lead: LeadData; motivo: string; nivel: 'critico' | 'alto' | 'normal' }

function calcPrioridad(lead: LeadData): Prioridad {
  const sinRes    = tiempoSinResponder(lead.sin_respuesta_asesor_desde)
  const seguim    = estadoSeguimiento(lead.proxima_accion_fecha)
  const noLeidos  = lead.no_leidos_count

  if (sinRes.urgente && noLeidos > 0)
    return { lead, motivo: `Mensaje sin responder · ${sinRes.texto}`, nivel: 'critico' }
  if (seguim === 'vencido')
    return { lead, motivo: 'Seguimiento vencido', nivel: 'critico' }
  if (sinRes.urgente)
    return { lead, motivo: sinRes.texto, nivel: 'alto' }
  if (seguim === 'hoy')
    return { lead, motivo: `Acción hoy: ${lead.proxima_accion ?? ''}`, nivel: 'alto' }
  if (noLeidos > 0)
    return { lead, motivo: `${noLeidos} mensaje${noLeidos > 1 ? 's' : ''} sin leer`, nivel: 'normal' }
  return { lead, motivo: 'Sin actividad urgente', nivel: 'normal' }
}

// Vista Prospectos: solo etapas de pipeline previas a la venta — una vez
// vendido (ganado en adelante) o cerrado (perdido) ya no es un "prospecto"
// que necesite seguimiento comercial activo.
const ETAPAS_PROSPECTO: EtapaVenta[] = [
  'nuevo', 'con_interes', 'con_objecion', 'seguimiento', 'buscando_credito', 'en_proceso_credito',
]

export default function VistaHoy({ leads, tenantId, onLeadPatch, onLeadRemove }: Props) {
  const etapasPipeline = useEtapasPipeline(tenantId)
  const [fichaId, setFichaId] = useState<string | null>(null)
  const [etapaFiltro, setEtapaFiltro] = useState<EtapaVenta | 'todas'>('todas')
  const [leadsLocal, setLeadsLocal] = useState<LeadData[]>(
    leads.filter(l => ETAPAS_PROSPECTO.includes(l.etapa_venta))
  )

  useEffect(() => {
    setLeadsLocal(leads.filter(l => ETAPAS_PROSPECTO.includes(l.etapa_venta)))
  }, [leads])

  const leadsMostrados = etapaFiltro === 'todas' ? leadsLocal : leadsLocal.filter(l => l.etapa_venta === etapaFiltro)

  const handleLeadUpdate = useCallback((id: string, updates: Record<string, unknown>) => {
    setLeadsLocal(prev => prev.map(l => {
      if (l.id !== id) return l
      const cp: Record<string, unknown> = {}
      if (updates.nombre  !== undefined) cp.nombre  = updates.nombre
      if (updates.celular !== undefined) cp.celular = updates.celular
      if (updates.placa   !== undefined) cp.placa   = updates.placa
      return {
        ...l,
        ...updates,
        ...(l.cliente && Object.keys(cp).length > 0 ? { cliente: { ...l.cliente, ...cp } } : {}),
      }
    }))
    onLeadPatch?.(id, updates)
  }, [onLeadPatch])

  const fichaLead = fichaId ? leadsLocal.find(l => l.id === fichaId) ?? null : null

  const prioridades: Prioridad[] = leadsMostrados
    .map(calcPrioridad)
    .sort((a, b) => {
      const orden = { critico: 0, alto: 1, normal: 2 }
      return orden[a.nivel] - orden[b.nivel]
    })

  const criticos = prioridades.filter(p => p.nivel === 'critico')
  const altos    = prioridades.filter(p => p.nivel === 'alto')
  const normales = prioridades.filter(p => p.nivel === 'normal')

  const filtroSelector = (
    <div className="flex items-center gap-2 mb-4">
      <label className="text-xs font-medium text-gray-500">Etapa:</label>
      <select value={etapaFiltro} onChange={e => setEtapaFiltro(e.target.value as EtapaVenta | 'todas')}
        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="todas">Todas ({leadsLocal.length})</option>
        {ETAPAS_PROSPECTO.map(id => (
          <option key={id} value={id}>{ETAPA_MAP[id].label} ({leadsLocal.filter(l => l.etapa_venta === id).length})</option>
        ))}
      </select>
    </div>
  )

  if (leadsMostrados.length === 0) {
    return (
      <>
        {filtroSelector}
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-4xl mb-3">🎉</p>
          <p className="font-semibold text-gray-700">Todo al día</p>
          <p className="text-sm text-gray-400 mt-1">No hay prospectos con acciones pendientes</p>
        </div>
      </>
    )
  }

  return (
    <>
      {filtroSelector}
      <div className="space-y-6">
        {criticos.length > 0 && (
          <Section
            titulo="Atención inmediata"
            subtitulo={`${criticos.length} prospecto${criticos.length > 1 ? 's' : ''} requieren acción ahora`}
            color="red"
            items={criticos}
            onOpen={setFichaId}
          />
        )}
        {altos.length > 0 && (
          <Section
            titulo="Acciones de hoy"
            subtitulo={`${altos.length} tarea${altos.length > 1 ? 's' : ''} programada${altos.length > 1 ? 's' : ''} para hoy`}
            color="amber"
            items={altos}
            onOpen={setFichaId}
          />
        )}
        {normales.length > 0 && (
          <Section
            titulo="En seguimiento"
            subtitulo={`${normales.length} prospecto${normales.length > 1 ? 's' : ''} activos sin urgencia`}
            color="gray"
            items={normales}
            onOpen={setFichaId}
          />
        )}
      </div>

      {fichaLead && (
        <FichaProspecto
          key={fichaLead.id}
          lead={fichaLead}
          tenantId={tenantId}
          onClose={() => setFichaId(null)}
          onEtapaChange={(id, etapa) => handleLeadUpdate(id, { etapa_venta: etapa })}
          onLeadUpdate={handleLeadUpdate}
          onLeadDelete={(id) => { setLeadsLocal(p => p.filter(l => l.id !== id)); setFichaId(null); onLeadRemove?.(id) }}
          etapasPipeline={etapasPipeline}
        />
      )}
    </>
  )
}

function Section({
  titulo, subtitulo, color, items, onOpen,
}: {
  titulo: string
  subtitulo: string
  color: 'red' | 'amber' | 'gray'
  items: Prioridad[]
  onOpen: (id: string) => void
}) {
  const colorMap = {
    red:   { dot: 'bg-red-500',   title: 'text-red-700',   badge: 'bg-red-100 text-red-700'     },
    amber: { dot: 'bg-amber-400', title: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
    gray:  { dot: 'bg-gray-400',  title: 'text-gray-600',  badge: 'bg-gray-100 text-gray-600'   },
  }
  const c = colorMap[color]

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
        <h3 className={`font-bold text-sm ${c.title}`}>{titulo}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${c.badge}`}>{subtitulo}</span>
      </div>

      <div className="space-y-2">
        {items.map(({ lead, motivo }) => {
          const etapaConfig = ETAPA_MAP[lead.etapa_venta]
          return (
            <button
              key={lead.id}
              onClick={() => onOpen(lead.id)}
              className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-md transition-shadow flex items-center gap-4"
            >
              {/* Avatar inicial */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: etapaConfig.color }}>
                {(lead.cliente?.nombre ?? '?').charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {lead.cliente?.nombre ?? 'Sin nombre'}
                  </p>
                  {lead.no_leidos_count > 0 && (
                    <span className="flex-shrink-0 w-5 h-5 bg-green-500 text-white rounded-full text-xs flex items-center justify-center font-bold">
                      {lead.no_leidos_count > 9 ? '9+' : lead.no_leidos_count}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">{motivo}</p>
                {lead.moto_interes && (
                  <p className="text-xs text-gray-400 truncate">🏍️ {lead.moto_interes}</p>
                )}
              </div>

              {/* Derecha */}
              <div className="text-right flex-shrink-0">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ background: etapaConfig.color }}>
                  {etapaConfig.label}
                </span>
                {lead.valor_estimado_venta ? (
                  <p className="text-xs text-emerald-700 font-semibold mt-1">{formatCOP(lead.valor_estimado_venta)}</p>
                ) : null}
              </div>

              <span className="text-gray-300 text-lg">›</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
