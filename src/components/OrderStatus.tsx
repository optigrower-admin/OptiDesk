import { Badge } from '@/components/ui/Badge'

type EstadoOrden = 'programado' | 'falta_revision' | 'en_proceso' | 'pendiente' | 'pagado' | 'listo' | 'finalizado_incompleto'

const config: Record<EstadoOrden, { label: string; variant: 'red' | 'blue' | 'amber' | 'teal' | 'green' | 'gray' | 'orange' }> = {
  programado:             { label: 'Programado',              variant: 'orange' },
  falta_revision:         { label: 'Falta revisión',          variant: 'red' },
  en_proceso:             { label: 'En proceso',              variant: 'blue' },
  pendiente:              { label: 'Pendiente',               variant: 'amber' },
  pagado:                 { label: 'Pagado',                  variant: 'teal' },
  listo:                  { label: 'Finalizado',              variant: 'green' },
  finalizado_incompleto:  { label: 'Finalizado - Incompleto', variant: 'gray' },
}

export function OrderStatus({ estado }: { estado: string }) {
  const { label, variant } = config[estado as EstadoOrden] ?? { label: estado, variant: 'gray' as const }
  return <Badge variant={variant}>{label}</Badge>
}
