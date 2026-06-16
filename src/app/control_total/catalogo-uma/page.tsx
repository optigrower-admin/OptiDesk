'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'

interface Tenant { id: string; nombre: string }
interface Repuesto {
  id: string
  codigo: string
  descripcion: string
  subgrupo: string | null
  cantidad: number
  precio_publico_iva: number | null
  activo: boolean
}

export default function CatalogoUMAPage() {
  const supabase = createClient()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [repuestos, setRepuestos] = useState<Repuesto[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState('')
  const [modoImport, setModoImport] = useState<'reemplazar' | 'agregar'>('reemplazar')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    supabase.from('tenants').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => {
      setTenants((data as Tenant[]) ?? [])
      if (data?.length) setTenantId(data[0].id)
    })
  }, [])

  const cargar = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    let query = supabase.from('repuestos_uma')
      .select('id, codigo, descripcion, subgrupo, cantidad, precio_publico_iva, activo')
      .eq('tenant_id', tenantId)
      .eq('tipo', 'repuesto')
      .order('codigo')
      .limit(500)
    if (busqueda) {
      const t = `%${busqueda}%`
      query = query.or(`codigo.ilike.${t},descripcion.ilike.${t}`)
    }
    const { data } = await query
    setRepuestos((data as Repuesto[]) ?? [])
    setLoading(false)
  }, [tenantId, busqueda])

  useEffect(() => { cargar() }, [cargar])

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return
    setImporting(true)
    setImportResult('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('tenant_id', tenantId)
      formData.append('modo', modoImport)
      const res = await fetch('/api/import-catalogo', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportResult(
        modoImport === 'reemplazar'
          ? `Importación exitosa: ${data.procesados} de ${data.total} registros actualizados/insertados`
          : `Importación exitosa: ${data.agregados} nuevos de ${data.total} registros (duplicados omitidos)`
      )
      await cargar()
    } catch (err: unknown) {
      setImportResult(`Error: ${err instanceof Error ? err.message : 'Error desconocido'}`)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const updateCantidad = async (id: string, cantidad: number) => {
    await supabase.from('repuestos_uma').update({ cantidad }).eq('id', id)
    setRepuestos((prev) => prev.map((r) => r.id === id ? { ...r, cantidad } : r))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Catálogo UMA</h1>
        <div className="flex items-center gap-3">
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-500 font-medium">Al importar:</span>
            {(['reemplazar', 'agregar'] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" name="modoImport" value={m} checked={modoImport === m}
                  onChange={() => setModoImport(m)} className="accent-blue-700" />
                <span className="text-xs font-medium text-gray-700">
                  {m === 'reemplazar' ? 'Reemplazar existentes' : 'Solo añadir nuevos'}
                </span>
              </label>
            ))}
          </div>
          <label className="cursor-pointer">
            <span className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors px-4 py-2 text-sm ${importing ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-700 text-white hover:bg-blue-800 cursor-pointer'}`}>
              {importing ? 'Importando...' : 'Importar Excel'}
            </span>
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" disabled={importing} />
          </label>
        </div>
      </div>

      {importResult && (
        <div className={`mb-4 p-3 rounded-lg text-sm border ${importResult.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {importResult}
        </div>
      )}

      <div className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código o descripción..." className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
              <th className="text-left py-3 px-4 font-medium">Código</th>
              <th className="text-left py-3 px-4 font-medium">Descripción</th>
              <th className="text-left py-3 px-4 font-medium">Subgrupo</th>
              <th className="text-center py-3 px-4 font-medium">Stock</th>
              <th className="text-right py-3 px-4 font-medium">P. Público IVA</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : repuestos.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-gray-400">Sin repuestos. Importa el Excel del catálogo UMA.</td></tr>
            ) : repuestos.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-xs text-gray-600">{r.codigo}</td>
                <td className="py-3 px-4 text-gray-800 max-w-xs truncate">{r.descripcion}</td>
                <td className="py-3 px-4 text-xs text-gray-500">{r.subgrupo ?? '—'}</td>
                <td className="py-3 px-4 text-center">
                  <input
                    type="number"
                    defaultValue={r.cantidad}
                    onBlur={(e) => updateCantidad(r.id, parseInt(e.target.value) || 0)}
                    className="w-16 px-1 py-0.5 border border-gray-200 rounded text-xs text-center"
                  />
                </td>
                <td className="py-3 px-4 text-right text-gray-700">{formatCOP(r.precio_publico_iva)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
