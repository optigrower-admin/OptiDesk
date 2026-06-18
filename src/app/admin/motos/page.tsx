'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'

interface Moto {
  id: string
  placa: string
  marca: string | null
  modelo: string | null
  año: number | null
  color: string | null
  notas: string | null
  cliente_id: string | null
  clientes: { nombre: string; cedula: string | null; celular: string | null } | null
  created_at: string
}

interface OrdenMoto {
  id: string
  numero: number
  estado: string
  tipo_orden: string
  valor_total: number
  created_at: string
  categorias_servicio: { nombre: string } | null
}

function MotosContent() {
  const { profile } = useAuth()
  const supabase = createClient()
  const searchParams = useSearchParams()
  const placaParam = searchParams.get('placa')

  const [motos, setMotos] = useState<Moto[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState(placaParam ?? '')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [historial, setHistorial] = useState<Record<string, OrdenMoto[]>>({})
  const [loadingHistorial, setLoadingHistorial] = useState<string | null>(null)

  // Modal editar
  const [editMoto, setEditMoto] = useState<Moto | null>(null)
  const [editMarca, setEditMarca] = useState('')
  const [editModelo, setEditModelo] = useState('')
  const [editAño, setEditAño] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editNotas, setEditNotas] = useState('')
  const [saving, setSaving] = useState(false)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const { data } = await supabase
      .from('motos')
      .select('id, placa, marca, modelo, año, color, notas, cliente_id, clientes:cliente_id(nombre, cedula, celular), created_at')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
    setMotos((data as unknown as Moto[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  // Si viene ?placa=XX desde la página de clientes, expandir automáticamente
  useEffect(() => {
    if (placaParam && motos.length > 0) {
      const moto = motos.find((m) => m.placa === placaParam)
      if (moto) {
        setExpandido(moto.id)
        cargarHistorial(moto.id, moto.placa)
      }
    }
  }, [placaParam, motos.length])

  const cargarHistorial = async (motoId: string, placa: string) => {
    if (historial[motoId] || !profile?.tenant_id) return
    setLoadingHistorial(motoId)
    // Busca por moto_id O por placa (para órdenes anteriores a la migración)
    const { data } = await supabase
      .from('ordenes')
      .select('id, numero, estado, tipo_orden, valor_total, created_at, categorias_servicio(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .eq('placa', placa)
      .order('created_at', { ascending: false })
      .limit(15)
    setHistorial((prev) => ({ ...prev, [motoId]: (data as unknown as OrdenMoto[]) ?? [] }))
    setLoadingHistorial(null)
  }

  const toggleExpandido = async (moto: Moto) => {
    if (expandido === moto.id) { setExpandido(null); return }
    setExpandido(moto.id)
    await cargarHistorial(moto.id, moto.placa)
  }

  const abrirEditar = (m: Moto) => {
    setEditMoto(m)
    setEditMarca(m.marca ?? '')
    setEditModelo(m.modelo ?? '')
    setEditAño(m.año ? String(m.año) : '')
    setEditColor(m.color ?? '')
    setEditNotas(m.notas ?? '')
  }

  const guardarEdicion = async () => {
    if (!editMoto) return
    setSaving(true)
    const nuevo = {
      marca: editMarca || null,
      modelo: editModelo || null,
      año: editAño ? parseInt(editAño) : null,
      color: editColor || null,
      notas: editNotas || null,
    }
    await supabase.from('motos').update(nuevo).eq('id', editMoto.id)
    await registrarAuditoria(supabase, {
      tenant_id: profile?.tenant_id ?? '',
      tabla: 'motos',
      registro_id: editMoto.id,
      tipo: 'edicion',
      valor_anterior: { marca: editMoto.marca, modelo: editMoto.modelo, año: editMoto.año, color: editMoto.color },
      valor_nuevo: nuevo,
      descripcion: `Editó datos de la moto ${editMoto.placa}`,
      usuario_id: profile?.id,
    })
    setSaving(false)
    setEditMoto(null)
    await cargar()
  }

  const motosFiltradas = motos.filter((m) => {
    const q = busqueda.toLowerCase()
    return (
      m.placa.toLowerCase().includes(q) ||
      (m.marca ?? '').toLowerCase().includes(q) ||
      (m.modelo ?? '').toLowerCase().includes(q) ||
      (m.clientes?.nombre ?? '').toLowerCase().includes(q) ||
      (m.clientes?.cedula ?? '').toLowerCase().includes(q)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Motos</h1>
          <p className="text-sm text-gray-500">{motos.length} registradas</p>
        </div>
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por placa, marca, modelo, cliente o cédula..."
        className="w-full max-w-sm px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-xl p-4 animate-pulse h-16 border border-gray-100" />)}
        </div>
      ) : motosFiltradas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">
            {busqueda ? `Sin resultados para "${busqueda}"` : 'Aún no hay motos registradas. Se crean automáticamente al registrar órdenes.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {motosFiltradas.map((m) => {
            const h = historial[m.id] ?? []
            const ordenActiva = h.find((o) => ['falta_revision', 'en_proceso', 'pendiente'].includes(o.estado))
            const totalCerradas = h.filter((o) => o.estado === 'listo').reduce((s, o) => s + o.valor_total, 0)
            return (
              <div key={m.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-lg font-bold font-mono text-gray-900">{m.placa}</span>
                      {ordenActiva && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Activa</span>
                      )}
                      {(m.marca || m.modelo) && (
                        <span className="text-sm text-gray-600">
                          {[m.marca, m.modelo, m.año].filter(Boolean).join(' ')}
                          {m.color ? ` · ${m.color}` : ''}
                        </span>
                      )}
                    </div>
                    {m.clientes && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-medium">{m.clientes.nombre}</span>
                        {m.clientes.cedula ? ` · CC ${m.clientes.cedula}` : ''}
                        {m.clientes.celular ? ` · ${m.clientes.celular}` : ''}
                      </p>
                    )}
                    {!m.clientes && (
                      <p className="text-xs text-gray-300 mt-0.5">Sin cliente vinculado</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/admin/motos/${m.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors font-medium"
                    >
                      Ver perfil →
                    </Link>
                    <button
                      onClick={() => abrirEditar(m)}
                      className="text-xs text-gray-400 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => toggleExpandido(m)}
                      className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    >
                      {expandido === m.id ? 'Ocultar' : 'Historial'}
                    </button>
                  </div>
                </div>

                {expandido === m.id && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                    {loadingHistorial === m.id ? (
                      <p className="text-sm text-gray-400">Cargando historial...</p>
                    ) : h.length === 0 ? (
                      <p className="text-sm text-gray-400">Sin órdenes registradas para esta moto.</p>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {h.length} orden{h.length !== 1 ? 'es' : ''}
                          </p>
                          {totalCerradas > 0 && (
                            <span className="text-xs text-green-700 font-semibold">Facturado: {formatCOP(totalCerradas)}</span>
                          )}
                        </div>
                        {h.map((o) => (
                          <Link
                            key={o.id}
                            href={`/admin/ordenes/${o.id}`}
                            className="flex items-center justify-between px-3 py-2 bg-white rounded-lg hover:bg-blue-50 transition-colors border border-gray-100"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${o.tipo_orden === 'venta_repuestos' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                {o.tipo_orden === 'venta_repuestos' ? 'Venta' : 'ST'}
                              </span>
                              <span className="text-gray-500 text-sm">#{o.numero}</span>
                              {o.categorias_servicio?.nombre && (
                                <span className="text-xs text-gray-400 truncate">{o.categorias_servicio.nombre}</span>
                              )}
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {new Date(o.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${estadoColor[o.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                                {estadoLabel[o.estado] ?? o.estado}
                              </span>
                              <span className="text-xs font-semibold text-gray-700">{formatCOP(o.valor_total)}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal editar moto */}
      {editMoto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h2 className="font-bold text-gray-900">Editar moto</h2>
              <p className="text-sm text-gray-500 font-mono">{editMoto.placa}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: 'Marca', value: editMarca, set: setEditMarca, placeholder: 'Honda' },
                { label: 'Modelo', value: editModelo, set: setEditModelo, placeholder: 'CB 125' },
                { label: 'Año', value: editAño, set: setEditAño, placeholder: '2022' },
                { label: 'Color', value: editColor, set: setEditColor, placeholder: 'Rojo' },
              ]).map((f) => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                  <input
                    type={f.label === 'Año' ? 'number' : 'text'}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
              <textarea
                value={editNotas}
                onChange={(e) => setEditNotas(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                placeholder="Observaciones sobre la moto..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={guardarEdicion}
                disabled={saving}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={() => setEditMoto(null)}
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

export default function MotosPage() {
  return (
    <Suspense>
      <MotosContent />
    </Suspense>
  )
}
