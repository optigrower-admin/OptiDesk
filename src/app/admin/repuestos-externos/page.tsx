'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'

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
  const [porEliminar, setPorEliminar] = useState<RepuestoExterno | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const esGerencia = profile?.rol === 'gerencia'

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

  const eliminar = async () => {
    if (!porEliminar || !profile?.tenant_id) return
    setEliminando(true)
    try {
      const { error } = await supabase.from('repuestos_externos').delete().eq('id', porEliminar.id)
      if (error) throw error
      await registrarAuditoria(supabase, {
        tenant_id: profile.tenant_id,
        tabla: 'repuestos_externos',
        registro_id: porEliminar.id,
        tipo: 'eliminacion',
        valor_anterior: { codigo: porEliminar.codigo, nombre: porEliminar.nombre },
        descripcion: `Eliminó el repuesto externo "${porEliminar.nombre}" del catálogo`,
        usuario_id: profile.id,
      })
      setPorEliminar(null)
      await cargar()
    } finally {
      setEliminando(false)
    }
  }

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
              {esGerencia && <th className="py-3 px-4 w-16" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b animate-pulse">
                  {Array.from({ length: esGerencia ? 7 : 6 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-100 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : repuestos.length === 0 ? (
              <tr><td colSpan={esGerencia ? 7 : 6} className="py-12 text-center text-gray-400">Sin repuestos externos registrados</td></tr>
            ) : repuestos.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-xs text-gray-500">{r.codigo ?? '—'}</td>
                <td className="py-3 px-4 text-gray-800">{r.nombre}</td>
                <td className="py-3 px-4 text-right text-gray-500">{formatCOP(r.ultimo_costo)}</td>
                <td className="py-3 px-4 text-right font-semibold">{formatCOP(r.ultimo_precio_venta)}</td>
                <td className="py-3 px-4 text-gray-500">{r.usuarios?.nombre ?? '—'}</td>
                <td className="py-3 px-4 text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString('es-CO')}</td>
                {esGerencia && (
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => setPorEliminar(r)}
                      className="text-gray-400 hover:text-red-600 transition-colors" title="Eliminar">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal confirmar eliminar */}
      {porEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-bold text-gray-900 mb-2">¿Eliminar repuesto externo?</h3>
            <p className="text-sm text-gray-500 mb-4">
              Se eliminará permanentemente <strong>{porEliminar.nombre}</strong> del catálogo de Externos/Propios.
              Las órdenes que ya lo usaron conservan sus datos — esto solo lo quita del catálogo para nuevas búsquedas.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPorEliminar(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={eliminar} disabled={eliminando}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                {eliminando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
