'use client'
import { PERIODO_LABEL, type PeriodoPreset } from '@/lib/dashboard/periodos'

const PRESETS: PeriodoPreset[] = ['hoy', 'ayer', '7d', 'semana', 'semana_anterior', '15d', 'mes', 'mes_anterior', 'anio', 'rango']

interface PeriodoFilterProps {
  preset: PeriodoPreset
  desdeManual: string
  hastaManual: string
  onChangePreset: (p: PeriodoPreset) => void
  onChangeDesdeManual: (v: string) => void
  onChangeHastaManual: (v: string) => void
}

export function PeriodoFilter({
  preset, desdeManual, hastaManual, onChangePreset, onChangeDesdeManual, onChangeHastaManual,
}: PeriodoFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => onChangePreset(p)}
          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
            preset === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {PERIODO_LABEL[p]}
        </button>
      ))}
      {preset === 'rango' && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={desdeManual}
            onChange={(e) => onChangeDesdeManual(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5"
          />
          <span className="text-xs text-gray-400">a</span>
          <input
            type="date"
            value={hastaManual}
            onChange={(e) => onChangeHastaManual(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5"
          />
        </div>
      )}
    </div>
  )
}
