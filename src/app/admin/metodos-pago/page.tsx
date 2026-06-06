'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

interface MetodoPago { id: string; nombre: string; activo: boolean }

export default function MetodosPagoPage() {
  const supabase = createClient()
  const { profile } = useAuth()
  const [metodos, setMetodos] = useState<MetodoPago[]>([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const { data } = await supabase
      .from('metodos_pago')
      .select('id, nombre, activo')
      .eq('tenant_id', profile.tenant_id)
      .order('nombre')
    setMetodos((data as MetodoPago[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async () => {
    if (!nuevoNombre.trim() || !profile?.tenant_id) return
    setSaving(true)
    await supabase.from('metodos_pago').insert({
      tenant_id: profile.tenant_id,
      nombre: nuevoNombre.trim(),
      activo: true,
    })
    setNuevoNombre('')
    await cargar()
    setSaving(false)
  }

  const eliminar = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return
    await supabase.from('metodos_pago').delete().eq('id', id)
    await cargar()
  }

  const toggle = async (id: string, activo: boolean) => {
    await supabase.from('metodos_pago').update({ activo: !activo }).eq('id', id)
    setMetodos((prev) => prev.map((m) => m.id === id ? { ...m, activo: !activo } : m))
  }

  const iniciarEdicion = (m: MetodoPago) => {
    setEditando(m.id)
    setEditNombre(m.nombre)
  }

  const guardarNombre = async (id: string) => {
    if (!editNombre.trim()) return
    await supabase.from('metodos_pago').update({ nombre: editNombre.trim() }).eq('id', id)
    setEditando(null)
    await cargar()
  }

  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Métodos de pago</h1>
        <p className="text-sm text-gray-500 mt-1">
          Los métodos activos aparecen al registrar el pago de una orden.
        </p>
      </div>

      <div className="space-y-2">
        {metodos.length === 0 && (
          <p className="text-sm text-gray-400 italic">Sin métodos de pago. Agrega el primero abajo.</p>
        )}

        {metodos.map((m) => (
          <div
            key={m.id}
            className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-2 shadow-sm ${!m.activo ? 'opacity-60 border-gray-200' : 'border-gray-200'}`}
          >
            {editando === m.id ? (
              <>
                <input
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') guardarNombre(m.id); if (e.key === 'Escape') setEditando(null) }}
                  autoFocus
                  className="flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm font-semibold focus:outline-none"
                />
                <button onClick={() => guardarNombre(m.id)}
                  className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                  Guardar
                </button>
                <button onClick={() => setEditando(null)}
                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 font-semibold text-gray-900 text-sm">{m.nombre}</span>

                {/* Editar */}
                <button onClick={() => iniciarEdicion(m)}
                  className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Renombrar">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>

                {/* Toggle activo */}
                <button onClick={() => toggle(m.id, m.activo)}
                  className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${m.activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${m.activo ? 'translate-x-4' : ''}`} />
                </button>

                {/* Eliminar */}
                <button onClick={() => eliminar(m.id, m.nombre)}
                  className="text-red-400 hover:text-red-600 transition-colors p-1" title="Eliminar">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Agregar nuevo */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Nuevo método de pago</p>
        <div className="flex gap-2">
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && agregar()}
            placeholder="Ej: Efectivo, Transferencia, Nequi..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={agregar}
            disabled={saving || !nuevoNombre.trim()}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-200 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {saving ? '...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
