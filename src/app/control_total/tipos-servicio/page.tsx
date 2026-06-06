'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

interface Subcategoria { id: string; nombre: string; activo: boolean }
interface Categoria { id: string; nombre: string; activo: boolean; subcategorias_servicio: Subcategoria[] }
interface Tenant { id: string; nombre: string }

export default function TiposServicioPage() {
  const supabase = createClient()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [nuevaCat, setNuevaCat] = useState('')
  const [nuevaSubcats, setNuevaSubcats] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('tenants').select('id, nombre').order('nombre').then(({ data }) => {
      setTenants((data as Tenant[]) ?? [])
      if (data?.length) setTenantId(data[0].id)
    })
  }, [])

  const cargar = useCallback(async () => {
    if (!tenantId) return
    const { data } = await supabase
      .from('categorias_servicio')
      .select('id, nombre, activo, subcategorias_servicio(id, nombre, activo)')
      .eq('tenant_id', tenantId)
      .order('orden')
    setCategorias((data as Categoria[]) ?? [])
  }, [tenantId])

  useEffect(() => { cargar() }, [cargar])

  const addCategoria = async () => {
    if (!nuevaCat || !tenantId) return
    setSaving(true)
    await supabase.from('categorias_servicio').insert({ tenant_id: tenantId, nombre: nuevaCat, orden: categorias.length + 1 })
    setNuevaCat('')
    await cargar()
    setSaving(false)
  }

  const addSubcategoria = async (categoriaId: string) => {
    const nombre = nuevaSubcats[categoriaId]
    if (!nombre) return
    await supabase.from('subcategorias_servicio').insert({ categoria_id: categoriaId, nombre, orden: 99 })
    setNuevaSubcats((p) => ({ ...p, [categoriaId]: '' }))
    await cargar()
  }

  const toggleCat = async (id: string, activo: boolean) => {
    await supabase.from('categorias_servicio').update({ activo: !activo }).eq('id', id)
    await cargar()
  }

  const toggleSub = async (id: string, activo: boolean) => {
    await supabase.from('subcategorias_servicio').update({ activo: !activo }).eq('id', id)
    await cargar()
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tipos de servicio</h1>

      <div className="mb-6">
        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      <div className="space-y-4">
        {categorias.map((cat) => (
          <div key={cat.id} className="bg-white rounded-xl border border-gray-100">
            <div className={`flex items-center justify-between px-4 py-3 border-b ${!cat.activo ? 'opacity-60' : ''}`}>
              <span className="font-semibold text-gray-900">{cat.nombre}</span>
              <button onClick={() => toggleCat(cat.id, cat.activo)}
                className={`w-8 h-5 rounded-full transition-colors ${cat.activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${cat.activo ? 'translate-x-3' : ''}`} />
              </button>
            </div>
            <div className="p-3 space-y-2">
              {cat.subcategorias_servicio.map((sub) => (
                <div key={sub.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 ${!sub.activo ? 'opacity-50' : ''}`}>
                  <span className="text-sm text-gray-700">{sub.nombre}</span>
                  <button onClick={() => toggleSub(sub.id, sub.activo)}
                    className={`w-7 h-4 rounded-full transition-colors ${sub.activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                    <span className={`block w-3 h-3 bg-white rounded-full shadow transition-transform mx-0.5 ${sub.activo ? 'translate-x-3' : ''}`} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <input value={nuevaSubcats[cat.id] ?? ''} onChange={(e) => setNuevaSubcats((p) => ({ ...p, [cat.id]: e.target.value }))}
                  placeholder="Nueva subcategoría..." className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs" />
                <button onClick={() => addSubcategoria(cat.id)}
                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs font-medium">+</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-6">
        <input value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)}
          placeholder="Nueva categoría..." className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <Button onClick={addCategoria} loading={saving} disabled={!nuevaCat}>Agregar categoría</Button>
      </div>
    </div>
  )
}
