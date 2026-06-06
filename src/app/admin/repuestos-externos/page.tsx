'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'

interface RepuestoExterno {
  id: string
  codigo: string | null
  nombre: string
  ultimo_costo: number | null
  ultimo_precio_venta: number | null
  created_at: string
  usuarios: { nombre: string } | null
}

export default function RepuestosExternosPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [repuestos, setRepuestos] = useState<RepuestoExterno[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    let query = supabase
      .from('repuestos_externos')
      .select('id, codigo, nombre, ultimo_costo, ultimo_precio_venta, created_at, usuarios:registrado_por(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })

    if (busqueda) {
      const t = `%${busqueda}%`
      query = query.or(`codigo.ilike.${t},nombre.ilike.${t}`)
    }

    const { data } = await query.limit(300)
    setRepuestos((data as unknown as RepuestoExterno[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id, busqueda])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Repuestos externos</h1>
          <p className="text-sm text-gray-500">{repuestos.length} registros</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código o nombre..."
          className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
              <th className="text-left py-3 px-4 font-medium">Código</th>
              <th className="text-left py-3 px-4 font-medium">Nombre</th>
              <th className="text-right py-3 px-4 font-medium">Último costo</th>
              <th className="text-right py-3 px-4 font-medium">Último precio venta</th>
              <th className="text-left py-3 px-4 font-medium">Registrado por</th>
              <th className="text-left py-3 px-4 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : repuestos.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">Sin repuestos externos registrados</td></tr>
            ) : repuestos.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-xs text-gray-500">{r.codigo ?? '—'}</td>
                <td className="py-3 px-4 text-gray-800">{r.nombre}</td>
                <td className="py-3 px-4 text-right text-gray-500">{formatCOP(r.ultimo_costo)}</td>
                <td className="py-3 px-4 text-right font-semibold">{formatCOP(r.ultimo_precio_venta)}</td>
                <td className="py-3 px-4 text-gray-500">{r.usuarios?.nombre ?? '—'}</td>
                <td className="py-3 px-4 text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString('es-CO')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
