'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import Link from 'next/link'

type Cot = {
  id: string
  numero: number
  fecha_generacion: string
  cliente_nombre: string | null
  cliente_celular: string | null
  estado: string
  created_at: string
}

function pad(n: number) { return String(n).padStart(4, '0') }

export default function CotizacionesServTecPage() {
  useAuth() // solo para asegurar autenticación
  const [lista, setLista] = useState<Cot[]>([])
  const [loading, setLoading] = useState(true)

  async function cargar() {
    setLoading(true)
    try {
      const res = await fetch('/api/cotizaciones-servtec')
      if (!res.ok) throw new Error('Error al cargar')
      const data = await res.json()
      setLista(data ?? [])
    } catch { /* silencioso */ }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function eliminar(id: string, numero: number) {
    if (!confirm(`¿Eliminar cotización ST-${pad(numero)}? Esta acción no se puede deshacer.`)) return
    await fetch(`/api/cotizaciones-servtec/${id}`, { method: 'DELETE' })
    setLista(p => p.filter(c => c.id !== id))
  }

  return (
    <div className="p-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cotizaciones S. Técnico</h1>
          <p className="text-sm text-gray-500 mt-0.5">{lista.length} cotizaciones</p>
        </div>
        <Link href="/admin/cotizaciones-servtec/nueva"
          className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors">
          + Nueva cotización
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Cargando...</div>
      ) : lista.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔧</div>
          <p className="text-gray-500 font-medium">Sin cotizaciones aún</p>
          <p className="text-sm text-gray-400 mt-1">Crea la primera cotización de servicio técnico o repuestos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(c => (
            <div key={c.id} className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 hover:border-blue-300 hover:bg-blue-50 transition-all group">
              <Link href={`/admin/cotizaciones-servtec/${c.id}`} target="_blank" className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-900">ST-{pad(c.numero)}</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{c.estado}</span>
                </div>
                <div className="text-sm text-gray-700 mt-0.5 font-medium truncate">
                  {c.cliente_nombre ?? 'Sin nombre'}
                  {c.cliente_celular && <span className="text-gray-400 font-normal ml-2">{c.cliente_celular}</span>}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(c.fecha_generacion).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </Link>
              <div className="flex gap-2 flex-shrink-0">
                <Link href={`/admin/cotizaciones-servtec/${c.id}`} target="_blank"
                  className="px-3 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold hover:bg-blue-800">
                  Ver PDF
                </Link>
                <button onClick={() => eliminar(c.id, c.numero)}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
