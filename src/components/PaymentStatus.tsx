import { Badge } from '@/components/ui/Badge'

type EstadoPago = 'pagado' | 'abono' | 'pendiente'

const config: Record<EstadoPago, { label: string; variant: 'green' | 'amber' | 'red' }> = {
  pagado:   { label: 'Pagado',   variant: 'green' },
  abono:    { label: 'Abono',    variant: 'amber' },
  pendiente:{ label: 'Pendiente',variant: 'red' },
}

export function PaymentStatus({ estado, metodoPago }: { estado: EstadoPago; metodoPago?: string }) {
  const { label, variant } = config[estado] ?? { label: estado, variant: 'gray' as const }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge variant={variant}>{label}</Badge>
      {metodoPago && <span className="text-xs text-gray-500">{metodoPago}</span>}
    </span>
  )
}
