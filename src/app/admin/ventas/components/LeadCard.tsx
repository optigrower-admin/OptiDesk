'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ETAPA_MAP, tiempoSinResponder, estadoSeguimiento, formatCOP, type EtapaVenta } from '@/lib/ventas/pipeline'

export type ConvCanal = { id: string; canal: string; no_leidos_count: number }

export type LeadData = {
  id: string                    // conversacion_id primaria (más avanzada en etapa)
  etapa_venta: EtapaVenta
  etapa_venta_orden: number
  moto_interes: string | null
  valor_estimado_venta: number | null
  proxima_accion: string | null
  proxima_accion_fecha: string | null
  canal: string                 // canal de la conversación primaria
  lead_source: string | null
  no_leidos_count: number       // total sumado de todas las conversaciones
  sin_respuesta_asesor_desde: string | null
  assigned_to: string | null
  cliente: { id: string; nombre: string | null; celular: string | null } | null
  cliente_apellido: string | null
  cliente_documento: string | null
  cliente_email: string | null
  leads_campana: { utm_campaign: string | null }[] | null
  todas_conversaciones: ConvCanal[]  // todas las conversaciones del cliente
}

const CANAL_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  whatsapp:  { label: 'WhatsApp',  cls: 'bg-green-100 text-green-700', icon: '📱' },
  messenger: { label: 'Messenger', cls: 'bg-blue-100 text-blue-700',   icon: '💬' },
  instagram: { label: 'Instagram', cls: 'bg-pink-100 text-pink-700',   icon: '📸' },
  manual:    { label: 'Manual',    cls: 'bg-gray-100 text-gray-600',   icon: '✍️' },
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
  const campana       = lead.leads_campana?.[0]?.utm_campaign
  const canales       = lead.todas_conversaciones.length > 0
    ? lead.todas_conversaciones
    : [{ id: lead.id, canal: lead.canal, no_leidos_count: lead.no_leidos_count }]

  const datosCompletos = !!(
    lead.cliente?.nombre &&
    lead.cliente_apellido &&
    lead.cliente_documento &&
    lead.cliente?.celular &&
    lead.cliente_email
  )

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
      {/* Nombre + indicador datos + no leídos */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {datosCompletos ? (
            <span className="flex-shrink-0 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center" title="Datos completos">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
            </span>
          ) : (
            <span className="flex-shrink-0 text-amber-400 leading-none text-[13px]" title="Datos incompletos (nombre, apellido, cédula, celular o correo)">⚠</span>
          )}
          <p className="font-semibold text-sm text-gray-900 leading-tight truncate">
            {lead.cliente?.nombre ?? 'Sin nombre'}
          </p>
        </div>
        {lead.no_leidos_count > 0 && (
          <span className="flex-shrink-0 w-5 h-5 bg-green-500 text-white rounded-full text-xs flex items-center justify-center font-bold">
            {lead.no_leidos_count > 9 ? '9+' : lead.no_leidos_count}
          </span>
        )}
      </div>

      {/* Moto de interés */}
      {lead.moto_interes && (
        <p className="text-xs text-gray-500 mb-1.5 truncate">🏍️ {lead.moto_interes}</p>
      )}

      {/* Próximos pasos */}
      {lead.proxima_accion && (
        <p className="text-xs text-blue-700 font-medium mb-1.5 truncate">📌 {lead.proxima_accion}</p>
      )}

      {/* Etapa badge visible en la tarjeta */}
      <div className="mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white"
          style={{ background: ETAPA_MAP[lead.etapa_venta].color }}>
          {ETAPA_MAP[lead.etapa_venta].label}
        </span>
      </div>

      {/* Canales + origen */}
      <div className="flex flex-wrap gap-1 mb-2">
        {canales.map(c => {
          const cfg = CANAL_BADGE[c.canal] ?? CANAL_BADGE.manual
          return (
            <span key={c.id} className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${cfg.cls}`}>
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
              {c.no_leidos_count > 0 && (
                <span className="ml-0.5 bg-green-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold">
                  {c.no_leidos_count > 9 ? '9+' : c.no_leidos_count}
                </span>
              )}
            </span>
          )
        })}
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
