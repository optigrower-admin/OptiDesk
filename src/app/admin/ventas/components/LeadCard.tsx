'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { tiempoSinResponder, estadoSeguimiento, formatCOP, type EtapaVenta } from '@/lib/ventas/pipeline'
import type { EtapaDinamica } from '@/hooks/useEtapasPipeline'

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
  cliente: { id: string; nombre: string | null; celular: string | null; placa?: string | null } | null
  alistamientoOrdenId?: string | null
  cliente_apellido: string | null
  cliente_documento: string | null
  cliente_email: string | null
  nombre_pendiente_aprobacion: boolean | null
  leads_campana: { utm_campaign: string | null }[] | null
  todas_conversaciones: ConvCanal[]  // todas las conversaciones del cliente
  etiquetas: { id: string; nombre: string; color: string }[]
  tieneAlistamiento?: boolean
  estadoAprobacionMatricula?: 'pendiente' | 'aprobado' | 'rechazado'
  aprobadoMatriculaPor?: string | null
  revisionPerdida?: 'falta_revision' | 'revisado' | null
  colaboradores?: string[]
  tienePlaca?: boolean
  numero_carta_negociacion?: string | null
  numero_factura?: string | null
  fecha_entrega?: string | null
  creditoAprobadoEntidad?: string | null
  creditoRechazadoEntidades?: string[]
  creditoPorEntidad?: Record<string, string>  // entidad_id -> estado ('sin_iniciar'|'en_estudio'|'aprobado'|'rechazado')
  automatizado?: boolean
  flujo_nombre?: string | null
  updated_at?: string | null
  created_at?: string | null
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

function formatFechaHora(dateStr: string) {
  const d = new Date(dateStr)
  const fecha = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
  return `${fecha}, ${hora}`
}

function diasMovimientoBadge(dias: number): { bg: string; text: string; pulse: boolean } {
  if (dias <= 2)  return { bg: '#f3f4f6', text: '#9ca3af', pulse: false }
  if (dias <= 5)  return { bg: '#fef3c7', text: '#d97706', pulse: false }
  if (dias <= 9)  return { bg: '#fed7aa', text: '#ea580c', pulse: false }
  if (dias <= 14) return { bg: '#fee2e2', text: '#dc2626', pulse: false }
  return { bg: '#dc2626', text: '#ffffff', pulse: true }
}

interface Props {
  lead: LeadData
  onClick: () => void
  overlay?: boolean
  asignado?: string
  tenantId?: string
  usuarioId?: string
  etapaInfo?: EtapaDinamica
}

export default function LeadCard({ lead, onClick, overlay, asignado, etapaInfo }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const diasSinMovimiento = lead.updated_at
    ? Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86_400_000)
    : null

  const sinResponder     = tiempoSinResponder(lead.sin_respuesta_asesor_desde)
  const seguimiento      = estadoSeguimiento(lead.proxima_accion_fecha)
  const esUrgente        = sinResponder.urgente || seguimiento === 'vencido'
  const nombrePendiente  = lead.nombre_pendiente_aprobacion === true
  const esAutomatizado   = lead.automatizado === true
  const reglaAlistamiento  = etapaInfo?.reglas?.find(r => r.campo === 'alistamiento')
  const reglaCelular       = etapaInfo?.reglas?.find(r => r.campo === 'celular')
  const reglaPlaca         = etapaInfo?.reglas?.find(r => r.campo === 'placa')
  const reglaFechaEntrega  = etapaInfo?.reglas?.find(r => r.campo === 'fecha_entrega')
  const reglaAprobacion    = etapaInfo?.reglas?.find(r => r.campo === 'aprobacion_gerencia')

  const necesitaAlistamiento  = !!reglaAlistamiento && lead.tieneAlistamiento === false
  const necesitaCelular       = !!reglaCelular && !lead.cliente?.celular
  const necesitaPlaca         = !!reglaPlaca && lead.tienePlaca === false
  const necesitaFechaEntrega  = !!reglaFechaEntrega && !lead.fecha_entrega
  const esAprobado      = !!reglaAprobacion
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
      className={`rounded-xl border shadow-sm p-3 cursor-pointer select-none transition-shadow hover:shadow-md ${
        necesitaAlistamiento || necesitaPlaca
          ? 'bg-red-50 border-red-400 border-l-4 border-l-red-600'
          : necesitaFechaEntrega
            ? 'bg-orange-50 border-orange-300 border-l-4 border-l-orange-500'
          : necesitaCelular
            ? 'bg-orange-50 border-orange-300 border-l-4 border-l-orange-500'
            : nombrePendiente
              ? 'bg-amber-50 border-amber-300'
              : esUrgente
                ? 'bg-white border-l-4 border-l-red-500 border-r border-t border-b border-gray-200'
                : esAutomatizado
                  ? 'bg-blue-50 border-blue-200 border-l-4 border-l-blue-500'
                  : 'bg-white border-gray-200'
      } ${overlay ? 'shadow-lg rotate-1' : ''}`}
    >
      {/* Punto de urgencia — visible de un vistazo sin leer el resto de la tarjeta */}
      {(sinResponder.urgente || seguimiento === 'vencido' || seguimiento === 'hoy') && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              sinResponder.urgente || seguimiento === 'vencido' ? 'bg-red-500 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className={`text-[10px] font-bold uppercase tracking-wide ${
            sinResponder.urgente || seguimiento === 'vencido' ? 'text-red-600' : 'text-amber-600'
          }`}>
            {sinResponder.urgente ? sinResponder.texto : seguimiento === 'vencido' ? 'Seguimiento vencido' : 'Acción hoy'}
          </span>
        </div>
      )}

      {/* Badge automatizado */}
      {esAutomatizado && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
            🤖 AUTOMATIZADO
          </span>
          {lead.flujo_nombre && (
            <span className="text-[10px] text-blue-600 font-medium truncate max-w-[120px]">{lead.flujo_nombre}</span>
          )}
        </div>
      )}

      {/* Banner FALTA ALISTAMIENTO */}
      {necesitaAlistamiento && (
        <div className="bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md mb-2 flex items-center justify-center gap-1.5">
          ⚠ {(reglaAlistamiento?.etiqueta ?? 'Falta alistamiento').toUpperCase()}
        </div>
      )}

      {/* Banner SIN CELULAR */}
      {necesitaCelular && (
        <div className="bg-orange-500 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md mb-2 flex items-center justify-center gap-1.5">
          ⚠ {(reglaCelular?.etiqueta ?? 'Sin número de celular').toUpperCase()}
        </div>
      )}

      {/* Banner SIN PLACA */}
      {necesitaPlaca && (
        <div className="bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md mb-2 flex items-center justify-center gap-1.5">
          ⚠ {(reglaPlaca?.etiqueta ?? 'Sin placa asignada').toUpperCase()}
        </div>
      )}

      {/* Banner SIN FECHA DE ENTREGA */}
      {necesitaFechaEntrega && (
        <div className="bg-orange-500 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md mb-2 flex items-center justify-center gap-1.5">
          ⚠ {(reglaFechaEntrega?.etiqueta ?? 'Sin fecha de entrega').toUpperCase()}
        </div>
      )}

      {/* Badge APROBADOS PARA MATRICULAR */}
      {esAprobado && (
        <div className={`text-center py-1.5 px-2 rounded-lg mb-2 text-sm font-black uppercase tracking-widest ${
          lead.estadoAprobacionMatricula === 'aprobado'  ? 'bg-green-600 text-white'
          : lead.estadoAprobacionMatricula === 'rechazado' ? 'bg-red-600 text-white'
          : 'bg-amber-500 text-white'
        }`}>
          {lead.estadoAprobacionMatricula === 'aprobado'  ? '✅ APROBADO'
           : lead.estadoAprobacionMatricula === 'rechazado' ? '❌ RECHAZADO'
           : '⏳ PENDIENTE'}
        </div>
      )}

      {/* Badge revisión de pérdida (gerencia/dueño) */}
      {etapaInfo?.es_perdido && lead.revisionPerdida === 'falta_revision' && (
        <div className="text-center py-1.5 px-2 rounded-lg mb-2 text-[11px] font-bold uppercase tracking-widest bg-amber-500 text-white">
          ⏳ Falta revisión
        </div>
      )}

      {/* Aviso nombre pendiente de aprobación */}
      {nombrePendiente && (
        <p className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mb-1.5 inline-block">
          ⏳ Nombre por confirmar
        </p>
      )}

      {/* Nombre + indicador datos + no leídos + días sin movimiento */}
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
        <div className="flex items-center gap-1 flex-shrink-0">
          {diasSinMovimiento !== null && diasSinMovimiento >= 0 && (() => {
            const { bg, text, pulse } = diasMovimientoBadge(diasSinMovimiento)
            return (
              <span
                title={`${diasSinMovimiento} día${diasSinMovimiento === 1 ? '' : 's'} sin movimiento`}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none${pulse ? ' animate-pulse' : ''}`}
                style={{ background: bg, color: text }}
              >
                🕐 {diasSinMovimiento}d
              </span>
            )
          })()}
          {lead.no_leidos_count > 0 && (
            <span className="w-5 h-5 bg-green-500 text-white rounded-full text-xs flex items-center justify-center font-bold">
              {lead.no_leidos_count > 9 ? '9+' : lead.no_leidos_count}
            </span>
          )}
        </div>
      </div>

      {/* Moto de interés */}
      {lead.moto_interes && (
        <p className="text-xs text-gray-500 mb-1.5 truncate">🏍️ {lead.moto_interes}</p>
      )}

      {/* Próximos pasos */}
      {lead.proxima_accion && (
        <p className="text-xs text-blue-700 font-medium mb-1.5 truncate">📌 {lead.proxima_accion}</p>
      )}

      {/* Fecha de creación del cliente */}
      {lead.created_at && (
        <p className="text-[11px] text-gray-400 mb-1.5">🗓️ Agregado {formatFechaHora(lead.created_at)}</p>
      )}

      {/* Etapa badge visible en la tarjeta */}
      <div className="mb-2 flex flex-wrap gap-1 items-center">
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white"
          style={{ background: etapaInfo?.color ?? '#9CA3AF' }}>
          {etapaInfo?.label ?? lead.etapa_venta}
        </span>
        {lead.etiquetas.map(e => (
          <span key={e.id}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white leading-tight"
            style={{ background: e.color }}>
            {e.nombre}
          </span>
        ))}
      </div>

      {/* Entidades crédito: aprobada verde, rechazadas rojo tachado */}
      {(lead.creditoAprobadoEntidad || (lead.creditoRechazadoEntidades?.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {lead.creditoAprobadoEntidad && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">
              ✓ {lead.creditoAprobadoEntidad}
            </span>
          )}
          {lead.creditoRechazadoEntidades?.map(nombre => (
            <span key={nombre} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200 line-through">
              {nombre}
            </span>
          ))}
        </div>
      )}

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

      {/* Asesor asignado */}
      {asignado ? (
        <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 mb-1.5">
          <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0">
            {asignado.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-blue-700 truncate">{asignado}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 mb-1.5">
          <div className="w-5 h-5 rounded-full bg-gray-600 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
            ?
          </div>
          <span className="text-xs font-semibold text-white truncate">Sin asignar</span>
        </div>
      )}

      {/* Colaborando — quién más tiene visibilidad sobre este cliente */}
      {!!lead.colaboradores?.length && (
        <div className="flex items-center gap-1 flex-wrap mb-1.5" title={`Comparten visibilidad: ${lead.colaboradores.join(', ')}`}>
          <span className="text-[9px] text-gray-400">👥</span>
          {lead.colaboradores.map((c, i) => (
            <span key={i} className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 truncate max-w-[90px]">
              {c}
            </span>
          ))}
        </div>
      )}

      {/* Indicadores de urgencia (detalle adicional — el resumen ya está arriba) */}
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
