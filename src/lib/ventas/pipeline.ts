export type EtapaVenta =
  // LEADS
  | 'nuevo_mensaje' | 'nuevo' | 'con_interes' | 'con_objecion'
  // PROSPECTOS
  | 'seguimiento' | 'buscando_credito' | 'en_proceso_credito'
  // CIERRE
  | 'ganado'
  // PROCESO INTERNO
  | 'aprobado_matricula' | 'en_matricula' | 'alistamiento' | 'espera_entrega' | 'entregada'
  // POSVENTA
  | 'primera_revision' | 'segunda_revision' | 'tercera_revision'
  // FINALIZADO
  | 'proceso_finalizado'
  // PERDIDO
  | 'perdido'

export const ETAPAS: { id: EtapaVenta; label: string; color: string; bg: string; border: string }[] = [
  // ── Perdido ──────────────────────────────────────────────────────────────────── borde gris
  { id: 'perdido',            label: 'Cliente Perdido',           color: '#9CA3AF', bg: 'bg-gray-100',    border: 'border-gray-400'    },

  // ── Grupo Leads ──────────────────────────────────────────────────────────────── borde azul
  { id: 'nuevo_mensaje',      label: 'Nuevo Contacto - Mensaje',  color: '#0EA5E9', bg: 'bg-sky-50',      border: 'border-blue-500'    },
  { id: 'nuevo',              label: 'Nuevo',                     color: '#2563EB', bg: 'bg-blue-50',     border: 'border-blue-500'    },
  { id: 'con_interes',        label: 'Con Interés',               color: '#0891B2', bg: 'bg-cyan-50',     border: 'border-blue-500'    },
  { id: 'con_objecion',       label: 'Con objeción',              color: '#DC2626', bg: 'bg-red-50',      border: 'border-blue-500'    },

  // ── Grupo Seguimiento ────────────────────────────────────────────────────────── borde púrpura
  { id: 'seguimiento',        label: 'Seguimiento',               color: '#7E22CE', bg: 'bg-purple-50',   border: 'border-purple-600'  },
  { id: 'buscando_credito',   label: 'Buscando Crédito',          color: '#6B21A8', bg: 'bg-purple-50',   border: 'border-purple-600'  },
  { id: 'en_proceso_credito', label: 'En Proceso de Crédito',     color: '#581C87', bg: 'bg-purple-100',  border: 'border-purple-600'  },

  // ── Grupo Proceso de venta ───────────────────────────────────────────────────── borde verde
  { id: 'ganado',             label: 'Vendida/Carta Aprobación',  color: '#16A34A', bg: 'bg-green-50',    border: 'border-green-600'   },
  { id: 'aprobado_matricula', label: 'Aprobados para Matricular', color: '#B45309', bg: 'bg-amber-50',    border: 'border-green-600'   },
  { id: 'en_matricula',       label: 'En matrícula',              color: '#0F766E', bg: 'bg-teal-50',     border: 'border-green-600'   },
  { id: 'alistamiento',       label: 'Alistamiento',              color: '#0E7490', bg: 'bg-cyan-50',     border: 'border-green-600'   },
  { id: 'espera_entrega',     label: 'Espera entrega',            color: '#0369A1', bg: 'bg-sky-100',     border: 'border-green-600'   },
  { id: 'entregada',          label: 'Entregada',                 color: '#15803D', bg: 'bg-emerald-50',  border: 'border-green-600'   },

  // ── Grupo Revisiones ─────────────────────────────────────────────────────────── borde índigo
  { id: 'primera_revision',   label: '1mera Revisión',            color: '#4338CA', bg: 'bg-indigo-50',   border: 'border-indigo-600'  },
  { id: 'segunda_revision',   label: '2da Revisión',              color: '#3730A3', bg: 'bg-indigo-100',  border: 'border-indigo-600'  },
  { id: 'tercera_revision',   label: '3cera Revisión',            color: '#312E81', bg: 'bg-indigo-200',  border: 'border-indigo-600'  },

  // ── Proceso Finalizado (solo) ────────────────────────────────────────────────── borde esmeralda
  { id: 'proceso_finalizado', label: 'Proceso Finalizado',        color: '#065F46', bg: 'bg-emerald-100', border: 'border-emerald-700' },
]

export const ETAPA_MAP = Object.fromEntries(ETAPAS.map(e => [e.id, e])) as Record<EtapaVenta, typeof ETAPAS[0]>

export const ETAPAS_ACTIVAS: EtapaVenta[] = [
  'nuevo_mensaje', 'nuevo', 'con_interes', 'con_objecion',
  'seguimiento', 'buscando_credito', 'en_proceso_credito',
]

export const ETAPAS_POSVENTA: EtapaVenta[] = [
  'aprobado_matricula', 'en_matricula', 'alistamiento', 'espera_entrega', 'entregada',
  'primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado',
]

// Leads: necesitan celular registrado
export const ETAPAS_LEADS: EtapaVenta[] = ['nuevo_mensaje', 'nuevo', 'con_interes', 'con_objecion']

// Desde alistamiento en adelante: necesitan placa asignada
export const ETAPAS_NECESITAN_PLACA: EtapaVenta[] = [
  'alistamiento', 'espera_entrega', 'entregada',
  'primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado',
]

// Desde Espera entrega en adelante: campo fecha de entrega de la moto
export const ETAPAS_NECESITAN_FECHA_ENTREGA: EtapaVenta[] = [
  'espera_entrega', 'entregada',
  'primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado',
]

// Desde Vendida en adelante: necesita número de carta de negociación
export const ETAPAS_NECESITAN_CARTA_NEGOCIACION: EtapaVenta[] = [
  'ganado', 'aprobado_matricula', 'en_matricula', 'alistamiento', 'espera_entrega', 'entregada',
  'primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado',
]

// Desde Vendida en adelante: necesitan número de factura
export const ETAPAS_NECESITAN_FACTURA: EtapaVenta[] = [
  'ganado', 'aprobado_matricula', 'en_matricula', 'alistamiento', 'espera_entrega', 'entregada',
  'primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado',
]

// Numeric order for comparing etapa priority (higher = more advanced)
export const ETAPA_ORDEN: Record<EtapaVenta, number> = {
  perdido:            -2,
  nuevo_mensaje:      -1,
  nuevo:               0,
  con_interes:         1,
  con_objecion:        2,
  seguimiento:         5,
  buscando_credito:    6,
  en_proceso_credito:  7,
  ganado:              9,
  aprobado_matricula: 10,
  en_matricula:       11,
  alistamiento:       12,
  espera_entrega:     13,
  entregada:          14,
  primera_revision:   15,
  segunda_revision:   16,
  tercera_revision:   17,
  proceso_finalizado: 18,
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
