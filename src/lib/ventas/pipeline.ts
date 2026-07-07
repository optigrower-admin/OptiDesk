export type EtapaVenta =
  | 'nuevo' | 'con_objecion' | 'seguimiento' | 'buscando_credito'
  | 'calificado' | 'demo' | 'propuesta' | 'negociacion' | 'ganado'
  | 'en_matricula' | 'alistamiento' | 'espera_entrega' | 'entregada'
  | 'perdido'

export const ETAPAS: { id: EtapaVenta; label: string; color: string; bg: string; border: string }[] = [
  { id: 'nuevo',           label: 'Nuevo',             color: '#378ADD', bg: 'bg-blue-50',    border: 'border-blue-500'    },
  { id: 'con_objecion',    label: 'Con objeción',       color: '#DC2626', bg: 'bg-red-50',     border: 'border-red-600'     },
  { id: 'seguimiento',     label: 'Seguimiento',        color: '#7C3AED', bg: 'bg-violet-50',  border: 'border-violet-600'  },
  { id: 'buscando_credito',label: 'Buscando Crédito',   color: '#D97706', bg: 'bg-orange-50',  border: 'border-orange-500'  },
  { id: 'calificado',      label: 'Calificado',         color: '#1D9E75', bg: 'bg-emerald-50', border: 'border-emerald-600' },
  { id: 'demo',            label: 'Demo / Cita',        color: '#EF9F27', bg: 'bg-amber-50',   border: 'border-amber-500'   },
  { id: 'propuesta',       label: 'Propuesta',          color: '#534AB7', bg: 'bg-indigo-50',  border: 'border-indigo-600'  },
  { id: 'negociacion',     label: 'Negociación',        color: '#639922', bg: 'bg-lime-50',    border: 'border-lime-700'    },
  { id: 'ganado',          label: 'Vendida',            color: '#3B6D11', bg: 'bg-green-50',   border: 'border-green-700'   },
  { id: 'en_matricula',    label: 'En matrícula',       color: '#0F766E', bg: 'bg-teal-50',    border: 'border-teal-700'    },
  { id: 'alistamiento',    label: 'Alistamiento',       color: '#1D4ED8', bg: 'bg-blue-50',    border: 'border-blue-700'    },
  { id: 'espera_entrega',  label: 'Espera entrega',     color: '#A16207', bg: 'bg-yellow-50',  border: 'border-yellow-700'  },
  { id: 'entregada',       label: 'Entregada',          color: '#15803D', bg: 'bg-green-50',   border: 'border-green-800'   },
  { id: 'perdido',         label: 'Perdido',            color: '#888780', bg: 'bg-gray-50',    border: 'border-gray-400'    },
]

export const ETAPA_MAP = Object.fromEntries(ETAPAS.map(e => [e.id, e])) as Record<EtapaVenta, typeof ETAPAS[0]>

export const ETAPAS_ACTIVAS: EtapaVenta[] = [
  'nuevo', 'con_objecion', 'seguimiento', 'buscando_credito', 'calificado', 'demo', 'propuesta', 'negociacion',
]

export const ETAPAS_POSVENTA: EtapaVenta[] = ['en_matricula', 'alistamiento', 'espera_entrega', 'entregada']

// Numeric order for comparing etapa priority (higher = more advanced)
export const ETAPA_ORDEN: Record<EtapaVenta, number> = {
  nuevo: 0, con_objecion: 1, seguimiento: 2, buscando_credito: 3,
  calificado: 4, demo: 5, propuesta: 6, negociacion: 7, ganado: 8,
  en_matricula: 9, alistamiento: 10, espera_entrega: 11, entregada: 12, perdido: 13,
}

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
