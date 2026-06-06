'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuditLog } from '@/components/AuditLog'

export default function SuperadminAuditoriaPage() {
  const supabase = createClient()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('auditoria')
      .select('id, tipo, tabla, descripcion, created_at, usuarios(nombre)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (filtroTipo) query = query.eq('tipo', filtroTipo)
    const { data } = await query
    setEntries((data as []) ?? [])
    setLoading(false)
  }, [filtroTipo])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Auditoría global</h1>
      </div>
      <div className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
          <option value="">Todos los tipos</option>
          <option value="movimiento">Movimiento</option>
          <option value="edicion">Edición</option>
          <option value="eliminacion">Eliminación</option>
        </select>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? <div className="py-12 text-center text-gray-400">Cargando...</div> : <AuditLog entries={entries} />}
      </div>
    </div>
  )
}
