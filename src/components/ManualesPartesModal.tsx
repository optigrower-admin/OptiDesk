'use client'
import { useMemo, useState } from 'react'
import { MANUALES_PARTES } from '@/lib/manualesPartes'

type Tipo = 'Motocicletas' | 'Motocarros'

interface Props {
  onClose: () => void
}

export function ManualesPartesModal({ onClose }: Props) {
  const [tipo, setTipo] = useState<Tipo>('Motocicletas')
  const [busqueda, setBusqueda] = useState('')

  const manuales = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return MANUALES_PARTES
      .filter(m => m.carpeta === tipo)
      .filter(m => !q || m.nombre.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [tipo, busqueda])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[80vh]">

        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Manuales de Partes</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-4 pt-3 flex gap-2">
          {(['Motocicletas', 'Motocarros'] as Tipo[]).map(t => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                tipo === t ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="px-4 pt-3">
          <input
            autoFocus
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar manual por nombre..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="overflow-y-auto flex-1 p-3 space-y-1.5 mt-1">
          {manuales.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-6">Sin manuales que coincidan con la búsqueda</p>
          )}
          {manuales.map(m => (
            <a
              key={m.link}
              href={m.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-colors group"
            >
              <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm text-gray-700 group-hover:text-blue-700 truncate">{m.nombre}</span>
            </a>
          ))}
        </div>

        <div className="px-4 py-2.5 border-t text-xs text-gray-400 text-center">
          {manuales.length} manual{manuales.length === 1 ? '' : 'es'} · {tipo}
        </div>
      </div>
    </div>
  )
}
