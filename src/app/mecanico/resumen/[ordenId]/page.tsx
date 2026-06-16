'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { OrderStatus } from '@/components/OrderStatus'
import { PaymentStatus } from '@/components/PaymentStatus'
import { MediaGallery } from '@/components/MediaGallery'
import { formatCOP } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'

interface Medio {
  id: string
  url: string
  tipo: 'imagen' | 'video'
  nombre_archivo: string | null
  storage_location: 'r2' | 'drive'
  drive_url: string | null
}

interface OrdenDetalle {
  id: string
  numero: number
  placa: string
  cliente: string
  estado: string
  estado_pago: string
  valor_total: number
  descripcion: string | null
  categoria_servicio_id: string | null
  subcategoria_servicio_id: string | null
  categorias_servicio: { nombre: string } | null
  subcategorias_servicio: { nombre: string } | null
  metodos_pago: { nombre: string } | null
  items_orden: { id: string; descripcion: string; origen: string; cantidad: number; precio_venta: number }[]
}

interface Categoria {
  id: string
  nombre: string
  subcategorias_servicio: { id: string; nombre: string }[]
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

export default function ResumenMecanicoPage() {
  const params = useParams()
  const ordenId = String(params.ordenId)
  const router = useRouter()
  const { profile } = useAuth()
  const supabase = createClient()

  const [orden, setOrden] = useState<OrdenDetalle | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [medios, setMedios] = useState<Medio[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingMedia, setUploadingMedia] = useState(false)

  // Inline edit states
  const [editField, setEditField] = useState<string | null>(null)
  const [editCliente, setEditCliente] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editCategoriaId, setEditCategoriaId] = useState('')
  const [editSubcategoriaId, setEditSubcategoriaId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile?.tenant_id) return
    Promise.all([
      supabase
        .from('ordenes')
        .select(`id, numero, placa, cliente, estado, estado_pago, valor_total, descripcion,
          categoria_servicio_id, subcategoria_servicio_id,
          categorias_servicio(nombre), subcategorias_servicio(nombre),
          metodos_pago(nombre),
          items_orden(id, descripcion, origen, cantidad, precio_venta)`)
        .eq('id', ordenId)
        .single(),
      supabase
        .from('categorias_servicio')
        .select('id, nombre, subcategorias_servicio(id, nombre)')
        .eq('tenant_id', profile.tenant_id)
        .eq('activo', true)
        .order('orden'),
      supabase
        .from('medios')
        .select('id, url, tipo, nombre_archivo, storage_location, drive_url')
        .eq('orden_id', ordenId),
    ]).then(([{ data: ordenData }, { data: cats }, { data: mediosData }]) => {
      if (ordenData) {
        const o = ordenData as unknown as OrdenDetalle
        setOrden(o)
        setEditCliente(o.cliente)
        setEditDescripcion(o.descripcion ?? '')
        setEditCategoriaId(o.categoria_servicio_id ?? '')
        setEditSubcategoriaId(o.subcategoria_servicio_id ?? '')
      }
      setCategorias((cats as unknown as Categoria[]) ?? [])
      setMedios((mediosData as unknown as Medio[]) ?? [])
      setLoading(false)
    })
  }, [ordenId, profile?.tenant_id])

  const subcategoriasEdit = categorias.find((c) => c.id === editCategoriaId)?.subcategorias_servicio ?? []

  const guardarCampo = async (campo: 'cliente' | 'descripcion' | 'categoria') => {
    if (!orden) return
    setSaving(true)
    const anterior: Record<string, unknown> = {}
    const update: Record<string, unknown> = {}
    if (campo === 'cliente') { anterior.cliente = orden.cliente; update.cliente = editCliente.trim() }
    if (campo === 'descripcion') { anterior.descripcion = orden.descripcion; update.descripcion = editDescripcion.trim() || null }
    if (campo === 'categoria') {
      anterior.categoria_servicio_id = orden.categoria_servicio_id
      anterior.subcategoria_servicio_id = orden.subcategoria_servicio_id
      update.categoria_servicio_id = editCategoriaId || null
      update.subcategoria_servicio_id = editSubcategoriaId || null
    }
    await supabase.from('ordenes').update(update).eq('id', ordenId)
    await registrarAuditoria(supabase, {
      tenant_id: profile?.tenant_id ?? '',
      tabla: 'ordenes',
      registro_id: ordenId,
      tipo: 'edicion',
      valor_anterior: anterior,
      valor_nuevo: update,
      descripcion: `Mecánico editó ${campo} de orden #${orden.numero}`,
      usuario_id: profile?.id,
    })

    const { data } = await supabase
      .from('ordenes')
      .select(`id, numero, placa, cliente, estado, estado_pago, valor_total, descripcion,
        categoria_servicio_id, subcategoria_servicio_id,
        categorias_servicio(nombre), subcategorias_servicio(nombre),
        metodos_pago(nombre),
        items_orden(id, descripcion, origen, cantidad, precio_venta)`)
      .eq('id', ordenId)
      .single()
    if (data) setOrden(data as unknown as OrdenDetalle)
    setEditField(null)
    setSaving(false)
  }

  const cancelar = () => {
    if (!orden) return
    setEditCliente(orden.cliente)
    setEditDescripcion(orden.descripcion ?? '')
    setEditCategoriaId(orden.categoria_servicio_id ?? '')
    setEditSubcategoriaId(orden.subcategoria_servicio_id ?? '')
    setEditField(null)
  }

  const handleUploadFiles = async (files: File[]) => {
    setUploadingMedia(true)
    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('orden_id', ordenId)
      formData.append('tipo', file.type.startsWith('video/') ? 'video' : 'imagen')
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const medio = await res.json() as Medio
        setMedios((prev) => [...prev, medio])
      }
    }
    setUploadingMedia(false)
  }

  const handleDeleteMedio = async (id: string) => {
    const res = await fetch(`/api/media/${id}`, { method: 'DELETE' })
    if (res.ok) setMedios((prev) => prev.filter((m) => m.id !== id))
  }

  if (loading || !orden) return <div className="p-4 text-center text-gray-400">Cargando...</div>

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Orden #{orden.numero}</h1>
          <p className="text-xs text-gray-400 font-mono">{orden.placa}</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <OrderStatus estado={orden.estado} />
          <PaymentStatus estado={orden.estado_pago as 'pagado' | 'abono' | 'pendiente'} />
        </div>
      </div>

      {/* ── CAMPOS EDITABLES ── */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 overflow-hidden">

        {/* Cliente */}
        <div className="px-4 py-3">
          {editField === 'cliente' ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</label>
              <input
                value={editCliente}
                onChange={(e) => setEditCliente(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={() => guardarCampo('cliente')} disabled={saving}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                  {saving ? '...' : 'Guardar'}
                </button>
                <button onClick={cancelar} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Cliente</p>
                <p className="text-sm font-semibold text-gray-900">{orden.cliente}</p>
              </div>
              <button onClick={() => setEditField('cliente')} className="text-gray-400 hover:text-blue-600 p-1">
                <PencilIcon />
              </button>
            </div>
          )}
        </div>

        {/* Tipo de ingreso */}
        <div className="px-4 py-3">
          {editField === 'categoria' ? (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo de ingreso</label>
              <div className="flex flex-wrap gap-2">
                {categorias.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setEditCategoriaId(editCategoriaId === c.id ? '' : c.id); setEditSubcategoriaId('') }}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                      editCategoriaId === c.id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                    }`}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
              {subcategoriasEdit.length > 0 && (
                <select
                  value={editSubcategoriaId}
                  onChange={(e) => setEditSubcategoriaId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Sin subcategoría</option>
                  {subcategoriasEdit.map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <button onClick={() => guardarCampo('categoria')} disabled={saving}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                  {saving ? '...' : 'Guardar'}
                </button>
                <button onClick={cancelar} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Tipo de ingreso</p>
                <p className="text-sm font-semibold text-gray-900">
                  {orden.categorias_servicio?.nombre
                    ? <>
                        {orden.categorias_servicio.nombre}
                        {orden.subcategorias_servicio && (
                          <span className="text-gray-500 font-normal"> · {orden.subcategorias_servicio.nombre}</span>
                        )}
                      </>
                    : <span className="text-gray-400 italic font-normal">Sin tipo</span>
                  }
                </p>
              </div>
              <button onClick={() => setEditField('categoria')} className="text-gray-400 hover:text-blue-600 p-1">
                <PencilIcon />
              </button>
            </div>
          )}
        </div>

        {/* Descripción */}
        <div className="px-4 py-3">
          {editField === 'descripcion' ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción del trabajo</label>
              <textarea
                value={editDescripcion}
                onChange={(e) => setEditDescripcion(e.target.value)}
                autoFocus
                rows={3}
                className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm resize-none focus:outline-none"
                placeholder="Describe el trabajo a realizar..."
              />
              <div className="flex gap-2">
                <button onClick={() => guardarCampo('descripcion')} disabled={saving}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                  {saving ? '...' : 'Guardar'}
                </button>
                <button onClick={cancelar} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Descripción del trabajo</p>
                <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                  {orden.descripcion || <span className="text-gray-400 italic font-normal">Sin descripción</span>}
                </p>
              </div>
              <button onClick={() => setEditField('descripcion')} className="text-gray-400 hover:text-blue-600 p-1 flex-shrink-0 mt-1">
                <PencilIcon />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── FOTOS Y VIDEOS ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Fotos y videos</p>
          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
            uploadingMedia ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}>
            {uploadingMedia ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Subiendo...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar
              </>
            )}
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              disabled={uploadingMedia}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                if (files.length) handleUploadFiles(files)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <div className="p-3">
          <MediaGallery medios={medios} onDelete={handleDeleteMedio} />
        </div>
      </div>

      {/* ── INFORMACIÓN DE PAGO (solo lectura) ── */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-gray-400">Estado</p>
          <OrderStatus estado={orden.estado} />
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-gray-400">Estado de pago</p>
          <PaymentStatus estado={orden.estado_pago as 'pagado' | 'abono' | 'pendiente'} />
        </div>
        <div className="px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-gray-400">Método de pago</p>
          <p className="text-sm text-gray-700">
            {orden.metodos_pago?.nombre ?? <span className="text-gray-400 italic font-normal">Sin especificar</span>}
          </p>
        </div>
      </div>

      {/* ── REPUESTOS / MANO DE OBRA ── */}
      {(() => {
        const allItems = orden.items_orden ?? []
        const repuestos = allItems.filter((i) => i.origen !== 'mano_obra')
        const manoObra = allItems.filter((i) => i.origen === 'mano_obra')
        const totalRep = repuestos.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
        const totalMO = manoObra.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
        const totalReal = totalRep + totalMO

        const ItemFila = ({ item }: { item: typeof allItems[0] }) => (
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{item.descripcion}</p>
              <p className="text-xs text-gray-400">Cant: {item.cantidad}</p>
            </div>
            <span className="text-sm font-semibold text-gray-900 ml-2">
              {formatCOP(item.precio_venta * item.cantidad)}
            </span>
          </div>
        )

        return (
          <>
            {/* Repuestos */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-blue-50">
                <p className="text-sm font-semibold text-blue-800">Repuestos ({repuestos.length})</p>
              </div>
              {repuestos.length === 0
                ? <p className="px-4 py-3 text-sm text-gray-400 italic">Sin repuestos</p>
                : <div className="divide-y divide-gray-50">
                    {repuestos.map((item) => <ItemFila key={item.id} item={item} />)}
                    <div className="px-4 py-2.5 flex justify-between text-sm font-semibold bg-blue-50">
                      <span className="text-blue-700">Subtotal repuestos</span>
                      <span className="text-blue-900">{formatCOP(totalRep)}</span>
                    </div>
                  </div>
              }
            </div>

            {/* Mano de obra */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-orange-50">
                <p className="text-sm font-semibold text-orange-800">Mano de obra ({manoObra.length})</p>
              </div>
              {manoObra.length === 0
                ? <p className="px-4 py-3 text-sm text-gray-400 italic">Sin servicios de mano de obra</p>
                : <div className="divide-y divide-gray-50">
                    {manoObra.map((item) => <ItemFila key={item.id} item={item} />)}
                    <div className="px-4 py-2.5 flex justify-between text-sm font-semibold bg-orange-50">
                      <span className="text-orange-700">Subtotal mano de obra</span>
                      <span className="text-orange-900">{formatCOP(totalMO)}</span>
                    </div>
                  </div>
              }
            </div>

            {/* Total general */}
            {allItems.length > 0 && (
              <div className="bg-gray-900 rounded-xl px-4 py-3.5 flex justify-between items-center">
                <span className="text-white font-bold text-sm">Total general</span>
                <span className="text-white font-bold text-lg">{formatCOP(totalReal)}</span>
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}
