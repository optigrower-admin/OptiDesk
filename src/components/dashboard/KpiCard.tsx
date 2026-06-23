'use client'
import type { Variacion } from '@/lib/dashboard/periodos'

interface KpiCardProps {
  label: string
  valor: string
  variacion?: Variacion
  comparativoLabel?: string
  sufijo?: string
}

export function KpiCard({ label, valor, variacion, comparativoLabel, sufijo }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">
        {valor}{sufijo && <span className="text-sm font-medium text-gray-400 ml-1">{sufijo}</span>}
      </p>
      {variacion && (
        <div className="flex items-center gap-1 mt-1.5">
          <span className={`text-xs font-semibold flex items-center gap-0.5 ${
            variacion.tendencia === 'up' ? 'text-green-600' : variacion.tendencia === 'down' ? 'text-red-600' : 'text-gray-400'
          }`}>
            {variacion.tendencia === 'up' && '▲'}
            {variacion.tendencia === 'down' && '▼'}
            {variacion.tendencia === 'flat' && '–'}
            {variacion.pct === null ? '' : ` ${Math.abs(variacion.pct).toFixed(1)}%`}
          </span>
          {comparativoLabel && <span className="text-xs text-gray-400">{comparativoLabel}</span>}
        </div>
      )}
    </div>
  )
}
