'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { AuditLog } from '@/components/AuditLog'

export default function AdminAuditoriaPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroTabla, setFiltroTabla] = useState('')

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    let query = supabase
      .from('auditoria')
      .select('id, tipo, tabla, descripcion, created_at, valor_anterior, valor_nuevo, usuarios(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(300)

    if (filtroTipo) query = query.eq('tipo', filtroTipo)
    if (filtroTabla) query = query.eq('tabla', filtroTabla)

    const { data } = await query
    setEntries((data as []) ?? [])
    setLoading(false)
  }, [profile?.tenant_id, filtroTipo, filtroTabla])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Auditoría</h1>
      </div>

      <div className="bg-white rounded-xl p-4 border border-gray-100 mb-4 flex gap-3">
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">Todos los tipos</option>
          <option value="movimiento">Movimiento</option>
          <option value="edicion">Edición</option>
          <option value="eliminacion">Eliminación</option>
        </select>
        <select
          value={filtroTabla}
          onChange={(e) => setFiltroTabla(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">Todas las tablas</option>
          <option value="ordenes">Órdenes</option>
          <option value="items_orden">Ítems</option>
          <option value="medios">Medios</option>
          <option value="repuestos_uma">Repuestos UMA</option>
          <option value="repuestos_externos">Repuestos externos</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Cargando...</div>
        ) : (
          <AuditLog entries={entries} />
        )}
      </div>
    </div>
  )
}
