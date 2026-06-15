'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ETAPA_MAP, tiempoSinResponder, estadoSeguimiento, formatCOP, type EtapaVenta } from '@/lib/ventas/pipeline'

export type LeadData = {
  id: string
  etapa_venta: EtapaVenta
  etapa_venta_orden: number
  moto_interes: string | null
  valor_estimado_venta: number | null
  proxima_accion: string | null
  proxima_accion_fecha: string | null
  canal: string
  lead_source: string | null
  no_leidos_count: number
  sin_respuesta_asesor_desde: string | null
  cliente: { id: string; nombre: string | null; celular: string | null } | null
  leads_campana: { utm_campaign: string | null }[] | null
}

const CANAL_BADGE: Record<string, { label: string; cls: string }> = {
  whatsapp:  { label: 'WhatsApp',  cls: 'bg-green-100 text-green-700' },
  messenger: { label: 'Messenger', cls: 'bg-blue-100 text-blue-700'   },
  instagram: { label: 'Instagram', cls: 'bg-pink-100 text-pink-700'   },
  manual:    { label: 'Manual',    cls: 'bg-gray-100 text-gray-600'   },
}

function formatHora(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  lead: LeadData
  onClick: () => void
  overlay?: boolean
}

export default function LeadCard({ lead, onClick, overlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const sinResponder  = tiempoSinResponder(lead.sin_respuesta_asesor_desde)
  const seguimiento   = estadoSeguimiento(lead.proxima_accion_fecha)
  const esUrgente     = sinResponder.urgente || seguimiento === 'vencido'
  const canal         = CANAL_BADGE[lead.canal] ?? CANAL_BADGE.manual
  const campana       = lead.leads_campana?.[0]?.utm_campaign

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`bg-white rounded-xl border shadow-sm p-3 cursor-pointer select-none transition-shadow hover:shadow-md ${
        esUrgente ? 'border-l-4 border-l-red-500 border-r border-t border-b border-gray-200' : 'border-gray-200'
      } ${overlay ? 'shadow-lg rotate-1' : ''}`}
    >
      {/* Nombre + no leídos */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <p className="font-semibold text-sm text-gray-900 leading-tight truncate">
          {lead.cliente?.nombre ?? 'Sin nombre'}
        </p>
        {lead.no_leidos_count > 0 && (
          <span className="flex-shrink-0 w-5 h-5 bg-green-500 text-white rounded-full text-xs flex items-center justify-center font-bold">
            {lead.no_leidos_count > 9 ? '9+' : lead.no_leidos_count}
          </span>
        )}
      </div>

      {/* Moto de interés */}
      {lead.moto_interes && (
        <p className="text-xs text-gray-500 mb-2 truncate">🏍️ {lead.moto_interes}</p>
      )}

      {/* Valor estimado */}
      {lead.valor_estimado_venta && (
        <p className="text-xs font-semibold text-emerald-700 mb-2">{formatCOP(lead.valor_estimado_venta)}</p>
      )}

      {/* Etapa badge visible en la tarjeta */}
      <div className="mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white"
          style={{ background: ETAPA_MAP[lead.etapa_venta].color }}>
          {ETAPA_MAP[lead.etapa_venta].label}
        </span>
      </div>

      {/* Canal + origen */}
      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${canal.cls}`}>{canal.label}</span>
        {campana && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium truncate max-w-[80px]">
            {campana}
          </span>
        )}
        {lead.lead_source === 'referido' && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">Referido</span>
        )}
      </div>

      {/* Indicadores de urgencia */}
      {sinResponder.urgente && (
        <p className="text-xs text-red-600 font-semibold">⚡ {sinResponder.texto}</p>
      )}
      {!sinResponder.urgente && seguimiento === 'vencido' && (
        <p className="text-xs text-red-600 font-semibold">⏰ Seguimiento vencido</p>
      )}
      {!sinResponder.urgente && seguimiento === 'hoy' && lead.proxima_accion && lead.proxima_accion_fecha && (
        <p className="text-xs text-amber-700 font-medium truncate">
          📌 {lead.proxima_accion} · {formatHora(lead.proxima_accion_fecha)}
        </p>
      )}
      {!sinResponder.urgente && seguimiento === 'sin_accion' && (
        <p className="text-xs text-gray-400">Sin seguimiento programado</p>
      )}
    </div>
  )
}
