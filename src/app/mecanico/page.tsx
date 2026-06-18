'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef } from 'react'
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
  fecha_finalizacion: string | null
  numeros_orden_uma: string[] | null
  categoria_servicio_id: string | null
  subcategoria_servicio_ids: string[] | null
  categorias_servicio: { nombre: string } | null
}

interface GrupoPlaca {
  placa: string
  ordenes: Orden[]
  expandido: boolean
}

interface Categoria {
  id: string
  nombre: string
  subcategorias_servicio: { id: string; nombre: string }[]
}

export default function MecanicoHome() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [grupos, setGrupos] = useState<GrupoPlaca[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [filtroSubcategoria, setFiltroSubcategoria] = useState('todos')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [filtroOrdenPendiente, setFiltroOrdenPendiente] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!profile?.tenant_id) return
    const channel = supabase
      .channel(`ordenes-mecanico-${profile.tenant_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordenes', filter: `tenant_id=eq.${profile.tenant_id}` },
        () => setRefreshTick((t) => t + 1)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.tenant_id])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase
      .from('categorias_servicio')
      .select('id, nombre, subcategorias_servicio(id, nombre)')
      .eq('tenant_id', profile.tenant_id)
      .eq('activo', true)
      .order('orden')
      .then(({ data }) => setCategorias((data as Categoria[]) ?? []))
  }, [profile?.tenant_id])

  useEffect(() => {
    if (!profile?.tenant_id) return
    if (!hasLoadedRef.current) setLoading(true)

    let query = supabase
      .from('ordenes')
      .select('id, numero, placa, cliente, estado, estado_pago, created_at, fecha_finalizacion, numeros_orden_uma, categoria_servicio_id, subcategoria_servicio_ids, categorias_servicio(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .eq('tipo_orden', 'servicio')
      .order('created_at', { ascending: false })

    if (filtroEstado === 'activos') {
      query = query.in('estado', ['falta_revision', 'en_proceso', 'pendiente'])
    } else if (filtroEstado !== 'todos') {
      query = query.eq('estado', filtroEstado)
    }

    if (filtroCategoria !== 'todos') query = query.eq('categoria_servicio_id', filtroCategoria)
    if (filtroSubcategoria !== 'todos') query = query.contains('subcategoria_servicio_ids', [filtroSubcategoria])

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
      setGrupos((prev) => {
        const expandidoPorPlaca = new Map(prev.map((g) => [g.placa, g.expandido]))
        return Array.from(map.entries()).map(([placa, ordenes]) => ({
          placa,
          ordenes,
          expandido: expandidoPorPlaca.get(placa) ?? false,
        }))
      })
      hasLoadedRef.current = true
      setLoading(false)
    })
  }, [profile?.tenant_id, busqueda, filtroEstado, filtroCategoria, filtroSubcategoria, fechaDesde, fechaHasta, refreshTick])

  const toggleGrupo = (placa: string) => {
    setGrupos((prev) => prev.map((g) => g.placa === placa ? { ...g, expandido: !g.expandido } : g))
  }

  const estadoActivo = (o: Orden) => ['falta_revision', 'en_proceso', 'pendiente'].includes(o.estado)

  const tieneOrdenUMAPendiente = (grupo: GrupoPlaca) =>
    grupo.ordenes.some((o) => {
      if (o.estado === 'listo') return false
      const cat = o.categorias_servicio?.nombre ?? ''
      if (!cat.toLowerCase().includes('uma')) return false
      const nums = o.numeros_orden_uma ?? []
      return !nums.includes('N/A') && nums.filter((n) => n !== 'N/A').length === 0
    })

  const gruposFiltrados = filtroOrdenPendiente ? grupos.filter(tieneOrdenUMAPendiente) : grupos

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

      {categorias.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => { setFiltroCategoria('todos'); setFiltroSubcategoria('todos') }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filtroCategoria === 'todos' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos
          </button>
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => { setFiltroCategoria(filtroCategoria === c.id ? 'todos' : c.id); setFiltroSubcategoria('todos') }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filtroCategoria === c.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {(() => {
        const subs = categorias.find((c) => c.id === filtroCategoria)?.subcategorias_servicio ?? []
        return subs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFiltroSubcategoria('todos')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filtroSubcategoria === 'todos' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos
            </button>
            {subs.map((s) => (
              <button
                key={s.id}
                onClick={() => setFiltroSubcategoria(filtroSubcategoria === s.id ? 'todos' : s.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  filtroSubcategoria === s.id ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.nombre}
              </button>
            ))}
          </div>
        )
      })()}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { value: 'todos', label: 'Todos' },
          { value: 'activos', label: 'Activos' },
          { value: 'falta_revision', label: 'Falta revisión' },
          { value: 'en_proceso', label: 'En proceso' },
          { value: 'pendiente', label: 'Pendiente' },
          { value: 'pagado', label: 'Pagado' },
          { value: 'listo', label: 'Finalizado' },
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
        <span className="w-px h-4 bg-gray-200 mx-1 flex-shrink-0 self-center" />
        <button
          onClick={() => setFiltroOrdenPendiente((v) => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
            filtroOrdenPendiente ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'
          }`}
        >
          # Orden Pendiente
        </button>
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
      ) : gruposFiltrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-sm">Sin órdenes{busqueda ? ` para "${busqueda}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gruposFiltrados.map((grupo) => {
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
                    {tieneOrdenUMAPendiente(grupo) && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">
                        # Orden Pendiente
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
                            Entrada: {new Date(orden.created_at).toLocaleDateString('es-CO', {
                              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                          {orden.fecha_finalizacion && (
                            <p className="text-xs text-green-600 mt-0.5">
                              Salida: {new Date(orden.fecha_finalizacion).toLocaleDateString('es-CO', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                              })}
                            </p>
                          )}
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
