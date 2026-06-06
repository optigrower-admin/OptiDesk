'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'

interface RepuestoUMA {
  id: string
  codigo: string
  descripcion: string
  subgrupo: string | null
  cantidad: number
  precio_publico_iva: number | null
  precio_distribuidor_sin_iva: number | null
  activo: boolean
}

export default function RepuestosUMAPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [repuestos, setRepuestos] = useState<RepuestoUMA[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [subgrupo, setSubgrupo] = useState('')
  const [subgrupos, setSubgrupos] = useState<string[]>([])

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)

    let query = supabase
      .from('repuestos_uma')
      .select('id, codigo, descripcion, subgrupo, cantidad, precio_publico_iva, precio_distribuidor_sin_iva, activo')
      .eq('tenant_id', profile.tenant_id)
      .order('codigo')

    if (busqueda) {
      const term = `%${busqueda}%`
      query = query.or(`codigo.ilike.${term},descripcion.ilike.${term}`)
    }
    if (subgrupo) query = query.eq('subgrupo', subgrupo)

    const { data } = await query.limit(500)
    setRepuestos((data as RepuestoUMA[]) ?? [])

    if (!subgrupo && !busqueda) {
      const { data: sg } = await supabase
        .from('repuestos_uma')
        .select('subgrupo')
        .eq('tenant_id', profile.tenant_id)
        .not('subgrupo', 'is', null)
      const unique = Array.from(new Set((sg ?? []).map((r: { subgrupo: string }) => r.subgrupo))).sort()
      setSubgrupos(unique as string[])
    }

    setLoading(false)
  }, [profile?.tenant_id, busqueda, subgrupo])

  useEffect(() => { cargar() }, [cargar])

  const toggleActivo = async (id: string, activo: boolean) => {
    await supabase.from('repuestos_uma').update({ activo: !activo }).eq('id', id)
    setRepuestos((prev) => prev.map((r) => r.id === id ? { ...r, activo: !activo } : r))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo UMA</h1>
          <p className="text-sm text-gray-500">{repuestos.length} repuestos mostrados</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 mb-4 flex gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código o descripción..."
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <select
          value={subgrupo}
          onChange={(e) => setSubgrupo(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm min-w-40"
        >
          <option value="">Todos los subgrupos</option>
          {subgrupos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
              <th className="text-left py-3 px-4 font-medium">Código</th>
              <th className="text-left py-3 px-4 font-medium">Descripción</th>
              <th className="text-left py-3 px-4 font-medium">Subgrupo</th>
              <th className="text-center py-3 px-4 font-medium">Stock</th>
              <th className="text-right py-3 px-4 font-medium">P. Público IVA</th>
              <th className="text-right py-3 px-4 font-medium">P. Distribuidor</th>
              <th className="text-center py-3 px-4 font-medium">Activo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : repuestos.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-gray-400">Sin repuestos</td></tr>
            ) : repuestos.map((r) => (
              <tr key={r.id} className={`border-b hover:bg-gray-50 transition-colors ${!r.activo ? 'opacity-50' : ''}`}>
                <td className="py-3 px-4 font-mono text-xs text-gray-600">{r.codigo}</td>
                <td className="py-3 px-4 text-gray-800 max-w-xs truncate">{r.descripcion}</td>
                <td className="py-3 px-4 text-xs text-gray-500">{r.subgrupo ?? '—'}</td>
                <td className="py-3 px-4 text-center font-medium">{r.cantidad}</td>
                <td className="py-3 px-4 text-right">{formatCOP(r.precio_publico_iva)}</td>
                <td className="py-3 px-4 text-right">{formatCOP(r.precio_distribuidor_sin_iva)}</td>
                <td className="py-3 px-4 text-center">
                  <button
                    onClick={() => toggleActivo(r.id, r.activo)}
                    className={`w-8 h-5 rounded-full transition-colors ${r.activo ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${r.activo ? 'translate-x-3' : ''}`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
