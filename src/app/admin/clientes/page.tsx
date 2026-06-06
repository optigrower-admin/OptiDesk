'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'

interface Cliente {
  id: string
  nombre: string
  cedula: string | null
  celular: string | null
  email: string | null
  created_at: string
}

interface ClienteDetalle extends Cliente {
  motos: { id: string; placa: string; marca: string | null; modelo: string | null; año: number | null }[]
  ordenes: { id: string; numero: number; estado: string; tipo_orden: string; valor_total: number; created_at: string }[]
}

export default function ClientesPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<Record<string, ClienteDetalle>>({})
  const [loadingDetalle, setLoadingDetalle] = useState<string | null>(null)

  // Modal editar
  const [editCliente, setEditCliente] = useState<Cliente | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editCedula, setEditCedula] = useState('')
  const [editCelular, setEditCelular] = useState('')
  const [editNotas, setEditNotas] = useState('')
  const [saving, setSaving] = useState(false)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre, cedula, celular, email, created_at')
      .eq('tenant_id', profile.tenant_id)
      .order('nombre')
    setClientes((data as Cliente[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  const cargarDetalle = async (clienteId: string) => {
    if (detalle[clienteId] || !profile?.tenant_id) return
    setLoadingDetalle(clienteId)
    const [{ data: motos }, { data: ordenes }] = await Promise.all([
      supabase.from('motos').select('id, placa, marca, modelo, año').eq('cliente_id', clienteId),
      supabase.from('ordenes').select('id, numero, estado, tipo_orden, valor_total, created_at')
        .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(8),
    ])
    setDetalle((prev) => ({
      ...prev,
      [clienteId]: {
        ...clientes.find((c) => c.id === clienteId)!,
        motos: (motos as unknown as ClienteDetalle['motos']) ?? [],
        ordenes: (ordenes as ClienteDetalle['ordenes']) ?? [],
      },
    }))
    setLoadingDetalle(null)
  }

  const toggleExpandido = async (id: string) => {
    if (expandido === id) { setExpandido(null); return }
    setExpandido(id)
    await cargarDetalle(id)
  }

  const abrirEditar = (c: Cliente) => {
    setEditCliente(c)
    setEditNombre(c.nombre)
    setEditCedula(c.cedula ?? '')
    setEditCelular(c.celular ?? '')
    setEditNotas('')
  }

  const guardarEdicion = async () => {
    if (!editCliente) return
    setSaving(true)
    await supabase.from('clientes').update({
      nombre: editNombre,
      cedula: editCedula || null,
      celular: editCelular || null,
      notas: editNotas || null,
    }).eq('id', editCliente.id)
    setSaving(false)
    setEditCliente(null)
    await cargar()
  }

  const clientesFiltrados = clientes.filter((c) => {
    const q = busqueda.toLowerCase()
    return (
      c.nombre.toLowerCase().includes(q) ||
      (c.cedula ?? '').includes(q) ||
      (c.celular ?? '').includes(q)
    )
  })

  const estadoColor: Record<string, string> = {
    falta_revision: 'bg-red-100 text-red-700',
    en_proceso: 'bg-blue-100 text-blue-700',
    pendiente: 'bg-amber-100 text-amber-700',
    listo: 'bg-green-100 text-green-700',
  }
  const estadoLabel: Record<string, string> = {
    falta_revision: 'Falta rev.', en_proceso: 'En proceso', pendiente: 'Pendiente', listo: 'Cerrada',
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500">{clientes.length} registrados</p>
        </div>
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre, cédula o celular..."
        className="w-full max-w-sm px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse h-16 border border-gray-100" />
          ))}
        </div>
      ) : clientesFiltrados.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">
            {busqueda ? `Sin resultados para "${busqueda}"` : 'Aún no hay clientes registrados. Se crean automáticamente al registrar órdenes con cédula.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {clientesFiltrados.map((c) => {
            const d = detalle[c.id]
            const totalGastado = d?.ordenes.filter((o) => o.estado === 'listo').reduce((s, o) => s + o.valor_total, 0) ?? 0
            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-700 text-sm flex-shrink-0">
                    {c.nombre[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.nombre}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                      {c.cedula && <span>CC {c.cedula}</span>}
                      {c.celular && <span>{c.celular}</span>}
                      {!c.cedula && !c.celular && <span className="text-gray-300">Sin identificación</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => abrirEditar(c)}
                      className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleExpandido(c.id)}
                      className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    >
                      {expandido === c.id ? 'Ocultar' : 'Ver historial'}
                    </button>
                  </div>
                </div>

                {expandido === c.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 space-y-4">
                    {loadingDetalle === c.id ? (
                      <p className="text-sm text-gray-400">Cargando...</p>
                    ) : d ? (
                      <>
                        {/* Motos */}
                        {d.motos.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Motos</p>
                            <div className="flex flex-wrap gap-2">
                              {d.motos.map((m) => (
                                <Link
                                  key={m.id}
                                  href={`/admin/motos?placa=${m.placa}`}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                                >
                                  <span className="text-sm font-mono font-bold text-gray-900">{m.placa}</span>
                                  {(m.marca || m.modelo) && (
                                    <span className="text-xs text-gray-500">
                                      {[m.marca, m.modelo, m.año].filter(Boolean).join(' ')}
                                    </span>
                                  )}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Órdenes */}
                        {d.ordenes.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Historial</p>
                              {totalGastado > 0 && (
                                <span className="text-xs text-green-700 font-semibold">Total: {formatCOP(totalGastado)}</span>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              {d.ordenes.map((o) => (
                                <Link
                                  key={o.id}
                                  href={`/admin/ordenes/${o.id}`}
                                  className="flex items-center justify-between px-3 py-2 bg-white rounded-lg hover:bg-blue-50 transition-colors border border-gray-100"
                                >
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${o.tipo_orden === 'venta_repuestos' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                      {o.tipo_orden === 'venta_repuestos' ? 'Venta' : 'ST'}
                                    </span>
                                    <span className="text-gray-500">#{o.numero}</span>
                                    <span className="text-gray-400 text-xs">
                                      {new Date(o.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' })}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${estadoColor[o.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                                      {estadoLabel[o.estado] ?? o.estado}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-700">{formatCOP(o.valor_total)}</span>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        {d.motos.length === 0 && d.ordenes.length === 0 && (
                          <p className="text-sm text-gray-400">Sin motos ni órdenes vinculadas aún.</p>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal editar cliente */}
      {editCliente && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-900">Editar cliente</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre *</label>
                <input
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cédula</label>
                <input
                  value={editCedula}
                  onChange={(e) => setEditCedula(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Celular</label>
                <input
                  value={editCelular}
                  onChange={(e) => setEditCelular(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={guardarEdicion}
                disabled={saving || !editNombre}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={() => setEditCliente(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
