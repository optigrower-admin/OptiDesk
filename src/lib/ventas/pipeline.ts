export type EtapaVenta = 'nuevo' | 'calificado' | 'demo' | 'propuesta' | 'negociacion' | 'ganado' | 'perdido'

export const ETAPAS: { id: EtapaVenta; label: string; color: string; bg: string; border: string }[] = [
  { id: 'nuevo',       label: 'Nuevo',        color: '#378ADD', bg: 'bg-blue-50',    border: 'border-blue-500'   },
  { id: 'calificado',  label: 'Calificado',   color: '#1D9E75', bg: 'bg-emerald-50', border: 'border-emerald-600' },
  { id: 'demo',        label: 'Demo / Cita',  color: '#EF9F27', bg: 'bg-amber-50',   border: 'border-amber-500'  },
  { id: 'propuesta',   label: 'Propuesta',    color: '#534AB7', bg: 'bg-indigo-50',  border: 'border-indigo-600' },
  { id: 'negociacion', label: 'Negociación',  color: '#639922', bg: 'bg-lime-50',    border: 'border-lime-700'   },
  { id: 'ganado',      label: 'Ganado',       color: '#3B6D11', bg: 'bg-green-50',   border: 'border-green-700'  },
  { id: 'perdido',     label: 'Perdido',      color: '#888780', bg: 'bg-gray-50',    border: 'border-gray-400'   },
]

export const ETAPA_MAP = Object.fromEntries(ETAPAS.map(e => [e.id, e])) as Record<EtapaVenta, typeof ETAPAS[0]>

export const ETAPAS_ACTIVAS: EtapaVenta[] = ['nuevo', 'calificado', 'demo', 'propuesta', 'negociacion']

export function formatCOP(value: number | null | undefined): string {
  if (!value) return '—'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
}

export function tiempoSinResponder(fecha: string | null): { minutos: number; texto: string; urgente: boolean } {
  if (!fecha) return { minutos: 0, texto: '', urgente: false }
  const minutos = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000)
  const urgente = minutos > 15
  const texto = minutos < 60
    ? `${minutos} min sin responder`
    : `${Math.floor(minutos / 60)}h ${minutos % 60}m sin responder`
  return { minutos, texto, urgente }
}

export function estadoSeguimiento(proxFecha: string | null): 'vencido' | 'hoy' | 'futuro' | 'sin_accion' {
  if (!proxFecha) return 'sin_accion'
  const ahora = new Date()
  const fecha = new Date(proxFecha)
  const inicioHoy = new Date(ahora); inicioHoy.setHours(0, 0, 0, 0)
  const finHoy    = new Date(ahora); finHoy.setHours(23, 59, 59, 999)
  if (fecha < ahora) return 'vencido'
  if (fecha >= inicioHoy && fecha <= finHoy) return 'hoy'
  return 'futuro'
}
