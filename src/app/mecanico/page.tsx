'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { OrderStatus } from '@/components/OrderStatus'
import { normalizarPlaca } from '@/lib/utils'

interface Orden {
  id: string
  numero: number
  placa: string
  cliente: string
  estado: string
  estado_pago: string
  created_at: string
  categorias_servicio: { nombre: string } | null
}

interface GrupoPlaca {
  placa: string
  ordenes: Orden[]
  expandido: boolean
}

export default function MecanicoHome() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [grupos, setGrupos] = useState<GrupoPlaca[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.tenant_id) return
    setLoading(true)

    let query = supabase
      .from('ordenes')
      .select('id, numero, placa, cliente, estado, estado_pago, created_at, categorias_servicio(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })

    if (filtroEstado === 'activos') {
      query = query.in('estado', ['falta_revision', 'en_proceso', 'pendiente'])
    } else if (filtroEstado !== 'todos') {
      query = query.eq('estado', filtroEstado)
    }

    if (busqueda) query = query.ilike('placa', `%${normalizarPlaca(busqueda)}%`)
    if (fechaDesde) query = query.gte('created_at', fechaDesde)
    if (fechaHasta) query = query.lte('created_at', fechaHasta + 'T23:59:59')

    query.then(({ data }) => {
      const ordenes = (data as unknown as Orden[]) ?? []
      // Agrupar por placa
      const map = new Map<string, Orden[]>()
      for (const o of ordenes) {
        if (!map.has(o.placa)) map.set(o.placa, [])
        map.get(o.placa)!.push(o)
      }
      setGrupos(Array.from(map.entries()).map(([placa, ordenes]) => ({
        placa,
        ordenes,
        expandido: false,
      })))
      setLoading(false)
    })
  }, [profile?.tenant_id, busqueda, filtroEstado, fechaDesde, fechaHasta])

  const toggleGrupo = (placa: string) => {
    setGrupos((prev) => prev.map((g) => g.placa === placa ? { ...g, expandido: !g.expandido } : g))
  }

  const estadoActivo = (o: Orden) => ['falta_revision', 'en_proceso', 'pendiente'].includes(o.estado)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Servicio técnico</h1>
          <p className="text-sm text-gray-500">Hola, {profile?.nombre ?? '...'}</p>
        </div>
        <Link
          href="/mecanico/recepcion/nueva"
          className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-800"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva
        </Link>
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por placa..."
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { value: 'todos', label: 'Todos' },
          { value: 'activos', label: 'Activos' },
          { value: 'falta_revision', label: 'Falta revisión' },
          { value: 'en_proceso', label: 'En proceso' },
          { value: 'pendiente', label: 'Pendiente' },
          { value: 'listo', label: 'Listos' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltroEstado(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filtroEstado === f.value ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Filtro fechas */}
      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {(fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setFechaDesde(''); setFechaHasta('') }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Limpiar
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-24 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-40" />
            </div>
          ))}
        </div>
      ) : grupos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">Sin órdenes{busqueda ? ` para "${busqueda}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((grupo) => {
            const ordenActual = grupo.ordenes.find(estadoActivo) ?? grupo.ordenes[0]
            return (
              <div key={grupo.placa} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Cabecera de la placa */}
                <button
                  onClick={() => toggleGrupo(grupo.placa)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xl font-bold text-gray-900 font-mono flex-shrink-0">{grupo.placa}</span>
                    <span className="text-sm text-gray-400 truncate">– {ordenActual.cliente}</span>
                    {grupo.ordenes.length > 1 && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                        {grupo.ordenes.length}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <OrderStatus estado={ordenActual.estado} />
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${grupo.expandido ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Órdenes expandidas */}
                {grupo.expandido && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {grupo.ordenes.map((orden) => (
                      <Link
                        key={orden.id}
                        href={`/mecanico/resumen/${orden.id}`}
                        className="flex items-start justify-between px-4 py-3 hover:bg-blue-50 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">#{orden.numero}</span>
                            <span className="text-sm font-medium text-gray-800">{orden.cliente}</span>
                          </div>
                          {orden.categorias_servicio && (
                            <p className="text-xs text-gray-400 mt-0.5">{orden.categorias_servicio.nombre}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(orden.created_at).toLocaleDateString('es-CO', {
                              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <OrderStatus estado={orden.estado} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
