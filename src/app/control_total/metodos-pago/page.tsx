'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

interface MetodoPago { id: string; nombre: string; activo: boolean; orden: number }
interface Tenant { id: string; nombre: string }

export default function MetodosPagoPage() {
  const supabase = createClient()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [metodos, setMetodos] = useState<MetodoPago[]>([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('tenants').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => {
      setTenants((data as Tenant[]) ?? [])
      if (data?.length) setTenantId(data[0].id)
    })
  }, [])

  const cargar = useCallback(async () => {
    if (!tenantId) return
    const { data } = await supabase.from('metodos_pago').select('id, nombre, activo, orden').eq('tenant_id', tenantId).order('orden')
    setMetodos((data as MetodoPago[]) ?? [])
  }, [tenantId])

  useEffect(() => { cargar() }, [cargar])

  const handleAdd = async () => {
    if (!nuevoNombre || !tenantId) return
    setSaving(true)
    await supabase.from('metodos_pago').insert({ tenant_id: tenantId, nombre: nuevoNombre, orden: metodos.length + 1 })
    setNuevoNombre('')
    await cargar()
    setSaving(false)
  }

  const toggleActivo = async (id: string, activo: boolean) => {
    await supabase.from('metodos_pago').update({ activo: !activo }).eq('id', id)
    setMetodos((prev) => prev.map((m) => m.id === id ? { ...m, activo: !activo } : m))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este método?')) return
    await supabase.from('metodos_pago').delete().eq('id', id)
    await cargar()
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Métodos de pago</h1>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Taller</label>
        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full">
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 divide-y mb-4">
        {metodos.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Sin métodos de pago</p>
        ) : metodos.map((m) => (
          <div key={m.id} className={`flex items-center justify-between px-4 py-3 ${!m.activo ? 'opacity-50' : ''}`}>
            <span className="text-sm text-gray-800">{m.nombre}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => toggleActivo(m.id, m.activo)}
                className={`w-8 h-5 rounded-full transition-colors ${m.activo ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${m.activo ? 'translate-x-3' : ''}`} />
              </button>
              <button onClick={() => handleDelete(m.id)} className="text-gray-300 hover:text-red-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
          placeholder="Nombre del método (ej: Nequi)" onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <Button onClick={handleAdd} loading={saving} disabled={!nuevoNombre}>Agregar</Button>
      </div>
    </div>
  )
}
