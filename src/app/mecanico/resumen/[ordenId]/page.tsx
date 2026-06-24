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
import { subirArchivoOrden } from '@/lib/clientUpload'
import { UploadProgressModal, type UploadItemState } from '@/components/UploadProgressModal'

interface Medio {
  id: string
  url: string
  tipo: 'imagen' | 'video'
  nombre_archivo: string | null
  storage_location: 'r2' | 'drive'
  drive_url: string | null
  procesando: boolean
}

interface OrdenDetalle {
  id: string
  numero: number
  placa: string
  cliente: string
  telefono: string | null
  estado: string
  estado_pago: string
  valor_total: number
  descripcion: string | null
  manifiesta_cliente: string | null
  diagnostico: string | null
  created_at: string
  fecha_finalizacion: string | null
  categoria_servicio_id: string | null
  subcategoria_servicio_id: string | null
  subcategoria_servicio_ids: string[] | null
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
  const [uploadItems, setUploadItems] = useState<UploadItemState[]>([])

  // Inline edit states
  const [editField, setEditField] = useState<string | null>(null)
  const [editPlaca, setEditPlaca] = useState('')
  const [editCliente, setEditCliente] = useState('')
  const [editTelefono, setEditTelefono] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editManifiestaCliente, setEditManifiestaCliente] = useState('')
  const [editDiagnostico, setEditDiagnostico] = useState('')
  const [editCategoriaId, setEditCategoriaId] = useState('')
  const [editSubcategoriaIds, setEditSubcategoriaIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!profile?.tenant_id) return
    Promise.all([
      supabase
        .from('ordenes')
        .select(`id, numero, placa, cliente, telefono, estado, estado_pago, valor_total, descripcion,
          manifiesta_cliente, diagnostico,
          created_at, fecha_finalizacion,
          categoria_servicio_id, subcategoria_servicio_id, subcategoria_servicio_ids,
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
        .select('id, url, tipo, nombre_archivo, storage_location, drive_url, procesando')
        .eq('orden_id', ordenId),
    ]).then(([{ data: ordenData }, { data: cats }, { data: mediosData }]) => {
      if (ordenData) {
        const o = ordenData as unknown as OrdenDetalle
        setOrden(o)
        setEditPlaca(o.placa)
        setEditCliente(o.cliente)
        setEditTelefono(o.telefono ?? '')
        setEditDescripcion(o.descripcion ?? '')
        setEditManifiestaCliente(o.manifiesta_cliente ?? '')
        setEditDiagnostico(o.diagnostico ?? '')
        setEditCategoriaId(o.categoria_servicio_id ?? '')
        setEditSubcategoriaIds(
          o.subcategoria_servicio_ids?.length
            ? o.subcategoria_servicio_ids
            : o.subcategoria_servicio_id ? [o.subcategoria_servicio_id] : []
        )
      }
      setCategorias((cats as unknown as Categoria[]) ?? [])
      setMedios((mediosData as unknown as Medio[]) ?? [])
      setLoading(false)
    })
  }, [ordenId, profile?.tenant_id])

  // Mientras haya un video procesándose en segundo plano (conversión a mp4),
  // se refresca la lista de medios cada pocos segundos hasta que termine.
  useEffect(() => {
    if (!medios.some((m) => m.procesando)) return
    const id = setInterval(async () => {
      const { data } = await supabase
        .from('medios')
        .select('id, url, tipo, nombre_archivo, storage_location, drive_url, procesando')
        .eq('orden_id', ordenId)
      if (data) setMedios(data as unknown as Medio[])
    }, 4000)
    return () => clearInterval(id)
  }, [medios, ordenId, supabase])

  const subcategoriasEdit = categorias.find((c) => c.id === editCategoriaId)?.subcategorias_servicio ?? []

  const esGarantia = (() => {
    const allSubs = categorias.flatMap((c) => c.subcategorias_servicio)
    const ids = orden?.subcategoria_servicio_ids?.length
      ? orden.subcategoria_servicio_ids
      : orden?.subcategoria_servicio_id ? [orden.subcategoria_servicio_id] : []
    return ids.some((id) => allSubs.find((s) => s.id === id)?.nombre.toLowerCase().includes('garant'))
  })()

  const guardarCampo = async (campo: 'placa' | 'cliente' | 'telefono' | 'descripcion' | 'categoria') => {
    if (!orden) return
    setSaving(true)
    const anterior: Record<string, unknown> = {}
    const update: Record<string, unknown> = {}
    if (campo === 'placa') { anterior.placa = orden.placa; update.placa = editPlaca.trim().toUpperCase() }
    if (campo === 'cliente') { anterior.cliente = orden.cliente; update.cliente = editCliente.trim() }
    if (campo === 'telefono') { anterior.telefono = orden.telefono; update.telefono = editTelefono.trim() || null }
    if (campo === 'descripcion') {
      if (esGarantia) {
        anterior.manifiesta_cliente = orden.manifiesta_cliente
        anterior.diagnostico = orden.diagnostico
        update.manifiesta_cliente = editManifiestaCliente.trim() || null
        update.diagnostico = editDiagnostico.trim() || null
      } else {
        anterior.descripcion = orden.descripcion
        update.descripcion = editDescripcion.trim() || null
      }
    }
    if (campo === 'categoria') {
      anterior.categoria_servicio_id = orden.categoria_servicio_id
      anterior.subcategoria_servicio_id = orden.subcategoria_servicio_id
      update.categoria_servicio_id = editCategoriaId || null
      update.subcategoria_servicio_id = editSubcategoriaIds[0] || null
      update.subcategoria_servicio_ids = editSubcategoriaIds
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
      .select(`id, numero, placa, cliente, telefono, estado, estado_pago, valor_total, descripcion,
        manifiesta_cliente, diagnostico,
        created_at, fecha_finalizacion,
        categoria_servicio_id, subcategoria_servicio_id, subcategoria_servicio_ids,
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
    setEditPlaca(orden.placa)
    setEditCliente(orden.cliente)
    setEditTelefono(orden.telefono ?? '')
    setEditDescripcion(orden.descripcion ?? '')
    setEditManifiestaCliente(orden.manifiesta_cliente ?? '')
    setEditDiagnostico(orden.diagnostico ?? '')
    setEditCategoriaId(orden.categoria_servicio_id ?? '')
    setEditSubcategoriaIds(orden.subcategoria_servicio_ids?.length ? orden.subcategoria_servicio_ids : orden.subcategoria_servicio_id ? [orden.subcategoria_servicio_id] : [])
    setEditField(null)
  }

  const handleUploadFiles = async (files: File[]) => {
    setUploadingMedia(true)
    const items: UploadItemState[] = files.map((f) => ({
      name: f.name,
      tipo: f.type.startsWith('video/') ? 'video' : 'imagen',
      progress: 0,
      status: 'uploading',
    }))
    setUploadItems(items)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const tipo = items[i].tipo
      try {
        const medio = await subirArchivoOrden({
          ordenId,
          file,
          tipo,
          onProgress: (pct) => setUploadItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, progress: pct } : it))),
        })
        setMedios((prev) => [...prev, medio as Medio])
        setUploadItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'done', progress: 100 } : it)))
      } catch (e) {
        setUploadItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'error', error: e instanceof Error ? e.message : 'No se pudo subir' } : it)))
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
      {uploadItems.length > 0 && (
        <UploadProgressModal items={uploadItems} onClose={() => setUploadItems([])} />
      )}
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-mono">{orden.placa}</h1>
          <p className="text-xs text-gray-400">Orden #{orden.numero}</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <OrderStatus estado={orden.estado} />
          <PaymentStatus estado={orden.estado_pago as 'pagado' | 'abono' | 'pendiente'} />
        </div>
      </div>

      {/* Entrada / Salida (solo lectura — la edición es exclusiva de gerencia) */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400 px-1">
        <span>
          <span className="font-medium text-gray-500">Entrada:</span>{' '}
          {new Date(orden.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
        {orden.fecha_finalizacion && (
          <span className="text-green-600">
            <span className="font-medium">Salida:</span>{' '}
            {new Date(orden.fecha_finalizacion).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* ── CAMPOS EDITABLES ── */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 overflow-hidden">

        {/* Placa */}
        <div className="px-4 py-3">
          {editField === 'placa' ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Placa</label>
              <input
                value={editPlaca}
                onChange={(e) => setEditPlaca(e.target.value.toUpperCase())}
                autoFocus
                className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm font-mono focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={() => guardarCampo('placa')} disabled={saving}
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
                <p className="text-xs text-gray-400">Placa</p>
                <p className="text-sm font-semibold text-gray-900 font-mono">{orden.placa}</p>
              </div>
              <button onClick={() => setEditField('placa')} className="text-gray-400 hover:text-blue-600 p-1">
                <PencilIcon />
              </button>
            </div>
          )}
        </div>

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

        {/* Celular */}
        <div className="px-4 py-3">
          {editField === 'telefono' ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Celular</label>
              <input
                type="tel"
                value={editTelefono}
                onChange={(e) => setEditTelefono(e.target.value)}
                autoFocus
                placeholder="310 000 0000"
                className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={() => guardarCampo('telefono')} disabled={saving}
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
                <p className="text-xs text-gray-400">Celular</p>
                <p className="text-sm font-semibold text-gray-900">
                  {orden.telefono || <span className="text-gray-400 italic font-normal">Sin celular</span>}
                </p>
              </div>
              <button onClick={() => setEditField('telefono')} className="text-gray-400 hover:text-blue-600 p-1">
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
                    onClick={() => { setEditCategoriaId(editCategoriaId === c.id ? '' : c.id); setEditSubcategoriaIds([]) }}
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
                <div className="flex flex-wrap gap-2">
                  {subcategoriasEdit.map((s) => (
                    <button key={s.id} type="button"
                      onClick={() => setEditSubcategoriaIds(prev =>
                        prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                      )}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                        editSubcategoriaIds.includes(s.id)
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                      }`}>
                      {s.nombre}
                    </button>
                  ))}
                </div>
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
                        {(() => {
                          const allSubs = categorias.flatMap(c => c.subcategorias_servicio)
                          const ids = orden.subcategoria_servicio_ids?.length ? orden.subcategoria_servicio_ids : orden.subcategoria_servicio_id ? [orden.subcategoria_servicio_id] : []
                          const nombres = ids.map(id => allSubs.find(s => s.id === id)?.nombre ?? orden.subcategorias_servicio?.nombre).filter(Boolean)
                          return nombres.length > 0 ? <span className="text-gray-500 font-normal"> · {nombres.join(' · ')}</span> : null
                        })()}
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

        {/* Descripción / Garantías */}
        <div className="px-4 py-3">
          {editField === 'descripcion' ? (
            esGarantia ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Manifiesta el Cliente:</label>
                  <textarea
                    value={editManifiestaCliente}
                    onChange={(e) => setEditManifiestaCliente(e.target.value)}
                    autoFocus
                    rows={3}
                    className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm resize-none focus:outline-none"
                    placeholder="Qué reporta el cliente..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Diagnóstico:</label>
                  <textarea
                    value={editDiagnostico}
                    onChange={(e) => setEditDiagnostico(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm resize-none focus:outline-none"
                    placeholder="Diagnóstico del taller..."
                  />
                </div>
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
            )
          ) : esGarantia ? (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-2">
                <div>
                  <p className="text-xs text-gray-400">Manifiesta el Cliente:</p>
                  <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                    {orden.manifiesta_cliente || <span className="text-gray-400 italic font-normal">Sin información</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Diagnóstico:</p>
                  <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                    {orden.diagnostico || <span className="text-gray-400 italic font-normal">Sin información</span>}
                  </p>
                </div>
              </div>
              <button onClick={() => setEditField('descripcion')} className="text-gray-400 hover:text-blue-600 p-1 flex-shrink-0 mt-1">
                <PencilIcon />
              </button>
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
          {uploadingMedia ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-400">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Subiendo...
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Cámara
                <input
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    if (files.length) handleUploadFiles(files)
                    e.target.value = ''
                  }}
                />
              </label>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Galería
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    if (files.length) handleUploadFiles(files)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          )}
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
