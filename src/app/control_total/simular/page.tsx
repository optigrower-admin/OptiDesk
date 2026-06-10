'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'

interface Orden {
  id: string
  numero: number
  placa: string | null
  cliente: string
  estado: string
  estado_pago: string
  valor_total: number
  tipo_orden: string | null
  tipo_servicio: string | null
  created_at: string
  categorias_servicio: { nombre: string } | null
  usuarios: { nombre: string } | null
}

interface Moto {
  id: string
  placa: string
  marca: string | null
  modelo: string | null
  clientes: { nombre: string } | null
}

interface Tenant {
  id: string
  nombre: string
  nombre_herramienta: string | null
}

const ROL_LABEL: Record<string, string> = {
  gerencia: 'Gerencia',
  admin: 'Administración',
  mecanico: 'Profesional',
}

const ESTADO_COLOR: Record<string, string> = {
  falta_revision: 'bg-red-100 text-red-700',
  en_proceso: 'bg-blue-100 text-blue-700',
  pendiente: 'bg-amber-100 text-amber-700',
  listo: 'bg-green-100 text-green-700',
}

const ESTADO_LABEL: Record<string, string> = {
  falta_revision: 'Falta revisión',
  en_proceso: 'En proceso',
  pendiente: 'Pendiente',
  listo: 'Cerrada',
}

function SimularContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const tenantId = searchParams.get('tenant') ?? ''
  const rol = searchParams.get('rol') ?? ''

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [motos, setMotos] = useState<Moto[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'ordenes' | 'motos'>('ordenes')
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    const [{ data: tn }, { data: ords }, { data: mts }] = await Promise.all([
      supabase.from('tenants').select('id, nombre, nombre_herramienta').eq('id', tenantId).single(),
      supabase.from('ordenes')
        .select('id, numero, placa, cliente, estado, estado_pago, valor_total, tipo_orden, tipo_servicio, created_at, categorias_servicio(nombre), usuarios:mecanico_id(nombre)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(rol === 'mecanico' ? 30 : 100),
      supabase.from('motos')
        .select('id, placa, marca, modelo, clientes:cliente_id(nombre)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(60),
    ])
    setTenant(tn as unknown as Tenant)
    setOrdenes((ords as unknown as Orden[]) ?? [])
    setMotos((mts as unknown as Moto[]) ?? [])
    setLoading(false)
  }, [tenantId, rol])

  useEffect(() => { cargar() }, [cargar])

  if (!tenantId || !rol) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Selecciona una empresa y un rol en el panel izquierdo para simular la vista.</p>
        <Link href="/control_total/dashboard" className="text-purple-600 hover:underline text-sm mt-2 block">
          ← Volver al dashboard
        </Link>
      </div>
    )
  }

  const ordenesFiltradas = ordenes.filter((o) => {
    if (rol === 'mecanico') {
      return ['falta_revision', 'en_proceso', 'pendiente'].includes(o.estado)
    }
    const q = busqueda.toLowerCase()
    if (!q) return true
    return (
      String(o.numero).includes(q) ||
      (o.placa ?? '').toLowerCase().includes(q) ||
      o.cliente.toLowerCase().includes(q)
    )
  })

  return (
    <div className="h-full flex flex-col">
      {/* Banner de simulación */}
      <div className="bg-purple-700 text-white px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-yellow-300 rounded-full animate-pulse" />
          <span className="text-sm font-medium">
            Simulando: <span className="font-bold">{ROL_LABEL[rol] ?? rol}</span>
            {tenant && <> en <span className="font-bold">{tenant.nombre}</span></>}
          </span>
          <span className="text-purple-300 text-xs">(solo lectura — datos reales)</span>
        </div>
        <Link
          href="/control_total/dashboard"
          className="text-purple-200 hover:text-white text-xs underline"
        >
          Salir de simulación
        </Link>
      </div>

      {/* Contenido simulado */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Cargando datos...</div>
        ) : (
          <div className="p-6 space-y-5 max-w-5xl mx-auto">

            {/* Header al estilo del rol */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {tenant?.nombre_herramienta ?? tenant?.nombre}
                </h1>
                <p className="text-sm text-purple-600 font-medium">{ROL_LABEL[rol]}</p>
              </div>
              <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-2.5 py-1 rounded-full font-medium">
                Vista simulada
              </span>
            </div>

            {/* Tabs */}
            {rol !== 'mecanico' && (
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
                {(['ordenes', 'motos'] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      tab === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}>
                    {t === 'ordenes' ? 'Órdenes' : 'Motos'}
                  </button>
                ))}
              </div>
            )}

            {/* Órdenes */}
            {(tab === 'ordenes' || rol === 'mecanico') && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-gray-900">
                    {rol === 'mecanico' ? 'Mis órdenes activas' : 'Servicio técnico'}
                  </h2>
                  {rol !== 'mecanico' && (
                    <input
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar por #, placa, cliente..."
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  {ordenesFiltradas.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">Sin órdenes</p>
                  ) : ordenesFiltradas.map((o) => (
                    <div key={o.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                      <span className="text-gray-400 font-mono text-sm">#{o.numero}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{o.placa ?? '—'}</span>
                          <span className="text-sm text-gray-500 truncate">{o.cliente}</span>
                          {o.categorias_servicio?.nombre && (
                            <span className="text-xs text-gray-400">{o.categorias_servicio.nombre}</span>
                          )}
                        </div>
                        {o.usuarios && (
                          <p className="text-xs text-gray-400 mt-0.5">Profesional: {(o.usuarios as { nombre: string }).nombre}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${ESTADO_COLOR[o.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ESTADO_LABEL[o.estado] ?? o.estado}
                        </span>
                        <span className="text-xs font-semibold text-gray-700">{formatCOP(o.valor_total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 text-right">{ordenesFiltradas.length} orden{ordenesFiltradas.length !== 1 ? 'es' : ''}</p>
              </div>
            )}

            {/* Motos */}
            {tab === 'motos' && rol !== 'mecanico' && (
              <div className="space-y-3">
                <h2 className="font-semibold text-gray-900">Motos registradas</h2>
                <div className="space-y-1.5">
                  {motos.length === 0 ? (
                    <p className="text-center text-gray-400 text-sm py-8">Sin motos registradas</p>
                  ) : motos.map((m) => (
                    <div key={m.id} className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 flex items-center gap-3">
                      <span className="font-mono font-bold text-gray-900">{m.placa}</span>
                      <span className="text-sm text-gray-500">{[m.marca, m.modelo].filter(Boolean).join(' ')}</span>
                      {m.clientes && (
                        <span className="text-xs text-gray-400 ml-auto">{(m.clientes as { nombre: string }).nombre}</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 text-right">{motos.length} motos</p>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

export default function SimularPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Cargando...</div>}>
      <SimularContent />
    </Suspense>
  )
}
