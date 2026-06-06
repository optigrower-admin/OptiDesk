'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

interface Subcategoria { id: string; nombre: string; activo: boolean }
interface Categoria { id: string; nombre: string; activo: boolean; subcategorias_servicio: Subcategoria[] }

export default function TiposServicioGerenciaPage() {
  const supabase = createClient()
  const { profile } = useAuth()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [nuevaCat, setNuevaCat] = useState('')
  const [nuevaSubcats, setNuevaSubcats] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  // Rename category
  const [editandoCat, setEditandoCat] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const { data } = await supabase
      .from('categorias_servicio')
      .select('id, nombre, activo, subcategorias_servicio(id, nombre, activo)')
      .eq('tenant_id', profile.tenant_id)
      .order('orden')
    setCategorias((data as Categoria[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  const addCategoria = async () => {
    if (!nuevaCat.trim() || !profile?.tenant_id) return
    setSaving(true)
    await supabase.from('categorias_servicio').insert({
      tenant_id: profile.tenant_id,
      nombre: nuevaCat.trim(),
      orden: categorias.length + 1,
    })
    setNuevaCat('')
    await cargar()
    setSaving(false)
  }

  const deleteCategoria = async (id: string) => {
    if (!confirm('¿Eliminar este tipo de servicio?')) return
    await supabase.from('categorias_servicio').delete().eq('id', id)
    await cargar()
  }

  const toggleCat = async (id: string, activo: boolean) => {
    await supabase.from('categorias_servicio').update({ activo: !activo }).eq('id', id)
    setCategorias((prev) => prev.map((c) => c.id === id ? { ...c, activo: !activo } : c))
  }

  const iniciarEdicion = (cat: Categoria) => {
    setEditandoCat(cat.id)
    setEditNombre(cat.nombre)
  }

  const guardarNombre = async (id: string) => {
    if (!editNombre.trim()) return
    await supabase.from('categorias_servicio').update({ nombre: editNombre.trim() }).eq('id', id)
    setEditandoCat(null)
    await cargar()
  }

  const addSubcategoria = async (categoriaId: string) => {
    const nombre = (nuevaSubcats[categoriaId] ?? '').trim()
    if (!nombre) return
    const { error } = await supabase.from('subcategorias_servicio').insert({
      categoria_id: categoriaId,
      nombre,
      orden: 99,
    })
    if (!error) {
      setNuevaSubcats((p) => ({ ...p, [categoriaId]: '' }))
      await cargar()
    }
  }

  const deleteSubcategoria = async (id: string) => {
    await supabase.from('subcategorias_servicio').delete().eq('id', id)
    await cargar()
  }

  const toggleSub = async (id: string, activo: boolean) => {
    await supabase.from('subcategorias_servicio').update({ activo: !activo }).eq('id', id)
    await cargar()
  }

  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tipos de servicio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Estos tipos aparecen como botones al crear una nueva recepción.
        </p>
      </div>

      <div className="space-y-3">
        {categorias.length === 0 && (
          <p className="text-sm text-gray-400 italic">Sin tipos de servicio. Agrega el primero abajo.</p>
        )}

        {categorias.map((cat) => (
          <div key={cat.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${!cat.activo ? 'opacity-60' : 'border-gray-200'}`}>

            {/* Cabecera */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              {editandoCat === cat.id ? (
                <>
                  <input
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') guardarNombre(cat.id); if (e.key === 'Escape') setEditandoCat(null) }}
                    autoFocus
                    className="flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm font-semibold focus:outline-none"
                  />
                  <button onClick={() => guardarNombre(cat.id)}
                    className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                    Guardar
                  </button>
                  <button onClick={() => setEditandoCat(null)}
                    className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-semibold text-gray-900">{cat.nombre}</span>
                  {/* Editar nombre */}
                  <button onClick={() => iniciarEdicion(cat)}
                    className="text-gray-400 hover:text-blue-600 transition-colors p-0.5" title="Renombrar">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {/* Toggle */}
                  <button onClick={() => toggleCat(cat.id, cat.activo)}
                    className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${cat.activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${cat.activo ? 'translate-x-4' : ''}`} />
                  </button>
                  {/* Eliminar */}
                  <button onClick={() => deleteCategoria(cat.id)}
                    className="text-red-400 hover:text-red-600 transition-colors p-0.5" title="Eliminar">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              )}
            </div>

            {/* Subcategorías */}
            <div className="px-4 py-3 space-y-2">
              {cat.subcategorias_servicio.map((sub) => (
                <div key={sub.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 ${!sub.activo ? 'opacity-50' : ''}`}>
                  <span className="text-sm text-gray-700">{sub.nombre}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleSub(sub.id, sub.activo)}
                      className={`w-7 h-4 rounded-full transition-colors ${sub.activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <span className={`block w-3 h-3 bg-white rounded-full shadow transition-transform mx-0.5 ${sub.activo ? 'translate-x-3' : ''}`} />
                    </button>
                    <button onClick={() => deleteSubcategoria(sub.id)}
                      className="text-red-400 hover:text-red-600 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {/* Agregar subcategoría */}
              <div className="flex gap-2 pt-1">
                <input
                  value={nuevaSubcats[cat.id] ?? ''}
                  onChange={(e) => setNuevaSubcats((p) => ({ ...p, [cat.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addSubcategoria(cat.id)}
                  placeholder="Agregar subcategoría..."
                  className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => addSubcategoria(cat.id)}
                  disabled={!nuevaSubcats[cat.id]?.trim()}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 rounded-lg text-xs font-semibold"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Agregar nueva categoría */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Nuevo tipo de servicio</p>
        <div className="flex gap-2">
          <input
            value={nuevaCat}
            onChange={(e) => setNuevaCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategoria()}
            placeholder="Ej: Garantía, 1er Cambio Aceite..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={addCategoria}
            disabled={saving || !nuevaCat.trim()}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-200 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {saving ? '...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
