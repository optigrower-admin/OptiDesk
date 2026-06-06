'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ConsultaRepuestos } from '@/components/ConsultaRepuestos'
import { MediaGallery } from '@/components/MediaGallery'
import { OrderStatus } from '@/components/OrderStatus'
import { PaymentStatus } from '@/components/PaymentStatus'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCOP } from '@/lib/utils'
import { registrarAuditoria } from '@/lib/audit'
import { registrarSalida, registrarDevolucion } from '@/lib/movimientos'

interface AuditEntry {
  id: string
  tipo: string
  descripcion: string | null
  valor_anterior: Record<string, unknown> | null
  valor_nuevo: Record<string, unknown> | null
  created_at: string
  usuarios: { nombre: string; email: string } | null
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  cliente: 'Cliente', descripcion: 'Descripción', estado: 'Estado',
  estado_pago: 'Pago', telefono: 'Teléfono', notas: 'Notas',
  valor_total: 'Total', valor_abono: 'Abono', motivo_pendiente: 'Motivo pendiente',
  numeros_orden_uma: '# Orden UMA', precio_venta: 'Precio', cantidad: 'Cantidad',
  estado_repuesto: 'Estado repuesto',
}

const AUDIT_SKIP = new Set([
  'updated_at', 'id', 'tenant_id', 'created_at', 'orden_id',
  'repuesto_uma_id', 'repuesto_externo_id', 'mecanico_id', 'metodo_pago_id',
  'subcategoria_servicio_id', 'categoria_servicio_id', 'numero_ot', 'nota_ot',
  'numero', 'tipo_orden', 'tipo_servicio', 'costo',
])

function getDiff(prev: Record<string, unknown>, next: Record<string, unknown>) {
  const diffs: { field: string; from: string; to: string }[] = []
  for (const key of Object.keys(prev)) {
    if (AUDIT_SKIP.has(key)) continue
    if (JSON.stringify(prev[key]) === JSON.stringify(next[key])) continue
    const fmtVal = (v: unknown): string => {
      if (v === null || v === undefined) return '—'
      if (Array.isArray(v)) return (v as unknown[]).join(', ') || '—'
      if (typeof v === 'number') return v.toLocaleString('es-CO')
      return String(v)
    }
    diffs.push({ field: AUDIT_FIELD_LABELS[key] ?? key, from: fmtVal(prev[key]), to: fmtVal(next[key]) })
    if (diffs.length >= 4) break
  }
  return diffs
}

function formatAuditDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function soloDigitos(val: string) { return val.replace(/\D/g, '') }

function formatTelefono(digits: string): string {
  const d = soloDigitos(digits).slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function formatAbonoDisplay(raw: string): string {
  const num = parseInt(soloDigitos(raw), 10)
  if (!raw || isNaN(num)) return ''
  return '$' + num.toLocaleString('es-CO')
}

type EstadoOrden = 'falta_revision' | 'en_proceso' | 'pendiente' | 'listo'
type EstadoPago = 'pagado' | 'abono' | 'pendiente'

interface Categoria {
  id: string
  nombre: string
  subcategorias_servicio: { id: string; nombre: string }[]
}

interface OrdenDetalle {
  id: string
  numero: number
  placa: string | null
  cliente: string
  telefono: string | null
  estado: EstadoOrden
  estado_pago: EstadoPago
  valor_total: number
  valor_abono: number
  motivo_pendiente: string | null
  descripcion: string | null
  tipo_orden: string | null
  tipo_servicio: string | null
  numero_ot: string | null
  nota_ot: string | null
  notas: string | null
  numeros_orden_uma: string[]
  categoria_servicio_id: string | null
  subcategoria_servicio_id: string | null
  tenant_id: string
  categorias_servicio: { nombre: string } | null
  subcategorias_servicio: { nombre: string } | null
  metodos_pago: { id: string; nombre: string } | null
  usuarios: { nombre: string } | null
}

interface ItemOrden {
  id: string
  descripcion: string
  origen: 'uma' | 'externo' | 'mano_obra'
  cantidad: number
  costo: number
  precio_venta: number
  repuesto_uma_id: string | null
  estado_repuesto: 'pedido' | 'ok' | null
}

interface Medio {
  id: string
  url: string
  tipo: 'imagen' | 'video'
  nombre_archivo: string | null
  storage_location: 'r2' | 'drive'
  drive_url: string | null
}

export default function AdminOrdenDetallePage() {
  const params = useParams()
  const ordenId = String(params.id)
  const router = useRouter()
  const { profile } = useAuth()
  const supabase = createClient()

  const [orden, setOrden] = useState<OrdenDetalle | null>(null)
  const [items, setItems] = useState<ItemOrden[]>([])
  const [medios, setMedios] = useState<Medio[]>([])
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])
  const [showConsulta, setShowConsulta] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [moDescripcion, setMoDescripcion] = useState('')
  const [moValor, setMoValor] = useState('')
  const [savingMO, setSavingMO] = useState(false)
  const [editingItem, setEditingItem] = useState<{ id: string; descripcion: string; precio: string } | null>(null)
  const [notas, setNotas] = useState('')
  const [savedOk, setSavedOk] = useState(false)
  const [numerosOrdenUMA, setNumerosOrdenUMA] = useState<string[]>([])
  const [nuevoNumOrden, setNuevoNumOrden] = useState('')
  // Edición de datos del ingreso
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [editingOrden, setEditingOrden] = useState<'cliente' | 'descripcion' | 'categoria' | null>(null)
  const [editCliente, setEditCliente] = useState('')
  const [editDescripcion, setEditDescripcion] = useState('')
  const [editCategoriaId, setEditCategoriaId] = useState('')
  const [editSubcategoriaId, setEditSubcategoriaId] = useState('')
  const [savingOrden, setSavingOrden] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  const [estado, setEstado] = useState<EstadoOrden>('en_proceso')
  const [estadoPago, setEstadoPago] = useState<EstadoPago>('pendiente')
  const [valorAbono, setValorAbono] = useState('')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [motivoPendiente, setMotivoPendiente] = useState('')
  const [telefono, setTelefono] = useState('')

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    const [{ data: o }, { data: i }, { data: m }, { data: mp }, { data: cats }] = await Promise.all([
      supabase.from('ordenes')
        .select(`id, numero, placa, cliente, telefono, estado, estado_pago, valor_total, valor_abono, motivo_pendiente, descripcion, tipo_orden, tipo_servicio, numero_ot, nota_ot, notas, numeros_orden_uma, categoria_servicio_id, subcategoria_servicio_id, tenant_id,
          categorias_servicio(nombre), subcategorias_servicio(nombre), metodos_pago(id, nombre), usuarios:mecanico_id(nombre)`)
        .eq('id', ordenId).single(),
      supabase.from('items_orden').select('id, descripcion, origen, cantidad, costo, precio_venta, estado_repuesto').eq('orden_id', ordenId),
      supabase.from('medios').select('id, url, tipo, nombre_archivo, storage_location, drive_url').eq('orden_id', ordenId),
      supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', profile.tenant_id).eq('activo', true),
      supabase.from('categorias_servicio').select('id, nombre, subcategorias_servicio(id, nombre)').eq('tenant_id', profile.tenant_id).eq('activo', true).order('orden'),
    ])
    if (o) {
      const ord = o as unknown as OrdenDetalle
      setOrden(ord)
      setEstado(ord.estado)
      setEstadoPago(ord.estado_pago)
      setValorAbono(String(ord.valor_abono ?? 0))
      setMetodoPagoId((ord.metodos_pago as { id: string } | null)?.id ?? '')
      setMotivoPendiente(ord.motivo_pendiente ?? '')
      setTelefono(soloDigitos(ord.telefono ?? ''))
      setNotas(ord.notas ?? '')
      setNumerosOrdenUMA(ord.numeros_orden_uma ?? [])
      setEditCliente(ord.cliente)
      setEditDescripcion(ord.descripcion ?? '')
      setEditCategoriaId(ord.categoria_servicio_id ?? '')
      setEditSubcategoriaId(ord.subcategoria_servicio_id ?? '')
    }
    setItems((i as unknown as ItemOrden[]) ?? [])
    setMedios((m as unknown as Medio[]) ?? [])
    setMetodosPago((mp as unknown as { id: string; nombre: string }[]) ?? [])
    setCategorias((cats as unknown as Categoria[]) ?? [])
  }, [ordenId, profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  const cargarAudit = async () => {
    setLoadingAudit(true)
    const itemIds = items.map((i) => i.id)
    const [{ data: auditOrden }, auditItemsResult] = await Promise.all([
      supabase.from('auditoria')
        .select('id, tipo, descripcion, valor_anterior, valor_nuevo, created_at, usuarios(nombre, email)')
        .eq('registro_id', ordenId)
        .order('created_at', { ascending: false })
        .limit(40),
      itemIds.length > 0
        ? supabase.from('auditoria')
            .select('id, tipo, descripcion, valor_anterior, valor_nuevo, created_at, usuarios(nombre, email)')
            .in('registro_id', itemIds)
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] }),
    ])
    const all = [
      ...((auditOrden as unknown as AuditEntry[]) ?? []),
      ...((auditItemsResult.data as unknown as AuditEntry[]) ?? []),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setAuditLog(all)
    setLoadingAudit(false)
  }

  const handleConfirmar = async () => {
    setConfirmando(true)
    try {
      await supabase.from('ordenes').update({
        estado: 'en_proceso',
        telefono: telefono || null,
      }).eq('id', ordenId)
      await registrarAuditoria(supabase, {
        tenant_id: orden!.tenant_id,
        tabla: 'ordenes',
        registro_id: ordenId,
        tipo: 'edicion',
        descripcion: `Confirmó orden #${orden?.numero} → en_proceso`,
        usuario_id: profile?.id,
      })
      await cargar()
    } finally {
      setConfirmando(false)
    }
  }

  const guardarCampoOrden = async (campo: 'cliente' | 'descripcion' | 'categoria') => {
    if (!orden) return
    setSavingOrden(true)
    const anterior: Record<string, unknown> = {}
    const update: Record<string, unknown> = {}
    if (campo === 'cliente') {
      anterior.cliente = orden.cliente
      update.cliente = editCliente.trim()
    }
    if (campo === 'descripcion') {
      anterior.descripcion = orden.descripcion
      update.descripcion = editDescripcion.trim() || null
    }
    if (campo === 'categoria') {
      anterior.categoria_servicio_id = orden.categoria_servicio_id
      anterior.subcategoria_servicio_id = orden.subcategoria_servicio_id
      update.categoria_servicio_id = editCategoriaId || null
      update.subcategoria_servicio_id = editSubcategoriaId || null
    }
    await supabase.from('ordenes').update(update).eq('id', ordenId)
    await registrarAuditoria(supabase, {
      tenant_id: orden.tenant_id,
      tabla: 'ordenes',
      registro_id: ordenId,
      tipo: 'edicion',
      valor_anterior: anterior,
      valor_nuevo: update,
      descripcion: `Admin editó ${campo} de orden #${orden.numero}`,
      usuario_id: profile?.id,
    })
    setEditingOrden(null)
    setSavingOrden(false)
    await cargar()
  }

  const handleDeleteItem = async (item: ItemOrden) => {
    if (!confirm(`¿Eliminar "${item.descripcion}"?`)) return
    await supabase.from('items_orden').delete().eq('id', item.id)
    // Devolver al inventario si era UMA
    await registrarDevolucion(supabase, {
      tenantId: orden!.tenant_id,
      repuesto_uma_id: item.repuesto_uma_id as string | undefined,
      cantidad: item.cantidad,
      costo_unitario: item.costo,
      precio_unitario: item.precio_venta,
      orden_id: ordenId,
      item_orden_id: item.id,
      registrado_por: profile?.id,
    })
    await registrarAuditoria(supabase, {
      tenant_id: orden!.tenant_id,
      tabla: 'items_orden',
      registro_id: item.id,
      tipo: 'eliminacion',
      valor_anterior: item as unknown as Record<string, unknown>,
      descripcion: `Eliminó ítem "${item.descripcion}" de orden #${orden?.numero}`,
      usuario_id: profile?.id,
    })
    await cargar()
  }

  const handleEstadoRepuesto = async (item: ItemOrden, nuevoEstado: 'pedido' | 'ok' | null) => {
    await supabase.from('items_orden').update({ estado_repuesto: nuevoEstado }).eq('id', item.id)
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, estado_repuesto: nuevoEstado } : i))
  }

  const handleDeleteMedio = async (id: string) => {
    if (!confirm('¿Eliminar este archivo?')) return
    await fetch(`/api/media/${id}`, { method: 'DELETE' })
    setMedios((prev) => prev.filter((m) => m.id !== id))
  }

  const handleAddItem = async (item: {
    descripcion: string; origen: 'uma' | 'externo'; repuesto_uma_id?: string;
    repuesto_externo_id?: string; cantidad: number; costo: number; precio_venta: number;
  }) => {
    const { data } = await supabase.from('items_orden').insert({
      orden_id: ordenId,
      ...item,
    }).select('*').single()
    if (data) {
      const nuevoTotal = [...items, data].reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      await Promise.all([
        supabase.from('ordenes').update({ valor_total: nuevoTotal }).eq('id', ordenId),
        // Registrar salida en inventario y descontar stock UMA
        registrarSalida(
          supabase,
          orden!.tipo_orden === 'venta_repuestos' ? 'venta_directa' : 'uso_st',
          {
            tenantId: orden!.tenant_id,
            repuesto_uma_id: item.repuesto_uma_id ?? null,
            repuesto_externo_id: item.repuesto_externo_id ?? null,
            cantidad: item.cantidad,
            costo_unitario: item.costo,
            precio_unitario: item.precio_venta,
            orden_id: ordenId,
            item_orden_id: (data as { id: string }).id,
            registrado_por: profile?.id,
          }
        ),
      ])
      await cargar()
    }
  }

  const handleEditItem = async () => {
    if (!editingItem || !editingItem.descripcion.trim()) return
    const precio = parseInt(editingItem.precio.replace(/\D/g, ''), 10) || 0
    await supabase.from('items_orden').update({
      descripcion: editingItem.descripcion.trim(),
      precio_venta: precio,
    }).eq('id', editingItem.id)
    const nuevoTotal = items.map((i) =>
      i.id === editingItem.id ? { ...i, precio_venta: precio, descripcion: editingItem.descripcion.trim() } : i
    ).reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
    await supabase.from('ordenes').update({ valor_total: nuevoTotal }).eq('id', ordenId)
    setEditingItem(null)
    await cargar()
  }

  const handleAddManoObra = async () => {
    const desc = moDescripcion.trim()
    const precio = parseInt(moValor.replace(/\D/g, ''), 10)
    if (!desc || !precio) return
    setSavingMO(true)
    const { data } = await supabase.from('items_orden').insert({
      orden_id: ordenId,
      descripcion: desc,
      origen: 'mano_obra',
      cantidad: 1,
      costo: 0,
      precio_venta: precio,
    }).select('*').single()
    if (data) {
      const nuevoTotal = [...items, data].reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      await supabase.from('ordenes').update({ valor_total: nuevoTotal }).eq('id', ordenId)
      setMoDescripcion('')
      setMoValor('')
      await cargar()
    }
    setSavingMO(false)
  }

  const handleGuardar = async () => {
    // Validar # Orden UMA obligatorio
    if (esUMA && numerosOrdenUMA.length === 0) {
      alert('Debes ingresar al menos un # de Orden UMA antes de guardar.')
      return
    }

    // Bloquear "Finalizado" si hay repuestos con estado "pedido"
    const repuestosPendientes = items.filter(
      (i) => i.origen !== 'mano_obra' && i.estado_repuesto === 'pedido'
    )
    if (estado === 'listo' && repuestosPendientes.length > 0) {
      alert(`No puedes finalizar la orden — hay ${repuestosPendientes.length} repuesto${repuestosPendientes.length !== 1 ? 's' : ''} marcado${repuestosPendientes.length !== 1 ? 's' : ''} como "Pedido" que aún no han llegado.`)
      return
    }

    setSaving(true)
    try {
      const valorAbonoNum = estadoPago === 'abono' ? parseFloat(valorAbono) || 0
        : estadoPago === 'pagado' ? (orden?.valor_total ?? 0) : 0

      await supabase.from('ordenes').update({
        estado,
        estado_pago: estadoPago,
        valor_abono: valorAbonoNum,
        metodo_pago_id: metodoPagoId || null,
        motivo_pendiente: estado === 'pendiente' ? motivoPendiente : null,
        telefono: telefono || null,
        notas: notas.trim() || null,
        numeros_orden_uma: numerosOrdenUMA,
      }).eq('id', ordenId)

      await registrarAuditoria(supabase, {
        tenant_id: orden!.tenant_id,
        tabla: 'ordenes',
        registro_id: ordenId,
        tipo: 'edicion',
        descripcion: `Actualizó orden #${orden?.numero}: estado=${estado}, pago=${estadoPago}`,
        usuario_id: profile?.id,
      })

      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 3500)
    } finally {
      setSaving(false)
      await cargar()
    }
  }

  if (!orden) return <div className="p-8 text-center text-gray-500">Cargando...</div>

  const repuestosItems = items.filter((i) => i.origen !== 'mano_obra')
  const manoObraItems = items.filter((i) => i.origen === 'mano_obra')
  const totalRepuestos = repuestosItems.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalManoObra = manoObraItems.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const costoTotal = repuestosItems.reduce((s, i) => s + i.costo * i.cantidad, 0)
  const total = totalRepuestos + totalManoObra
  const saldo = total - (parseFloat(valorAbono) || 0)
  const esFaltaRevision = orden.estado === 'falta_revision'
  const esUMA = orden.tipo_servicio === 'uma'
  const esVenta = orden.tipo_orden === 'venta_repuestos'

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{orden.placa ?? '—'}</h1>
              <span className="text-gray-400">#{orden.numero}</span>
              {esVenta && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Venta repuestos</span>
              )}
              {esUMA && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">UMA</span>
              )}
              <OrderStatus estado={orden.estado} />
              <PaymentStatus estado={orden.estado_pago} metodoPago={(orden.metodos_pago as { nombre: string } | null)?.nombre} />
            </div>
            <p className="text-gray-600 mt-0.5">{orden.cliente}</p>
            {orden.categorias_servicio && (
              <p className="text-sm text-gray-400">
                {orden.categorias_servicio.nombre}
                {orden.subcategorias_servicio && ` · ${orden.subcategorias_servicio.nombre}`}
              </p>
            )}
          </div>
        </div>
        {/* Reloj — historial de cambios */}
        <button
          onClick={() => { setShowAudit(true); cargarAudit() }}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
          title="Ver historial de cambios"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* Banner de confirmación */}
      {esFaltaRevision && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-red-800">Esta orden requiere tu revisión</p>
            <p className="text-sm text-red-600 mt-0.5">
              El Profesional Mecánica la registró. Revisa los datos, agrega el teléfono del cliente y confirma para ponerla en proceso.
            </p>
          </div>
          <button
            onClick={handleConfirmar}
            disabled={confirmando}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap flex-shrink-0 inline-flex items-center gap-2"
          >
            {confirmando && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            ✓ Confirmar orden
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda — Descripción, Ítems y medios */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info OT UMA */}
          {esUMA && (orden.numero_ot || orden.nota_ot) && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Orden de trabajo UMA</p>
              {orden.numero_ot && (
                <p className="text-sm text-purple-900"><span className="font-medium">N° OT:</span> {orden.numero_ot}</p>
              )}
              {orden.nota_ot && (
                <p className="text-sm text-purple-700 whitespace-pre-wrap">{orden.nota_ot}</p>
              )}
            </div>
          )}

          {/* Datos del ingreso — editables por el administrador */}
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Datos del ingreso</p>
            </div>

            {/* Cliente */}
            <div className="px-5 py-3">
              {editingOrden === 'cliente' ? (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-medium">Nombre del cliente</label>
                  <input autoFocus value={editCliente} onChange={(e) => setEditCliente(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none" />
                  <div className="flex gap-2">
                    <button onClick={() => guardarCampoOrden('cliente')} disabled={savingOrden}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {savingOrden ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => { setEditingOrden(null); setEditCliente(orden.cliente) }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Cliente</p>
                    <p className="text-sm font-semibold text-gray-900">{orden.cliente}</p>
                  </div>
                  <button onClick={() => setEditingOrden('cliente')} className="text-gray-400 hover:text-blue-600 p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Tipo de ingreso */}
            <div className="px-5 py-3">
              {editingOrden === 'categoria' ? (
                <div className="space-y-3">
                  <label className="text-xs text-gray-500 font-medium">Tipo de ingreso</label>
                  <div className="flex flex-wrap gap-2">
                    {categorias.map((c) => (
                      <button key={c.id} type="button"
                        onClick={() => { setEditCategoriaId(editCategoriaId === c.id ? '' : c.id); setEditSubcategoriaId('') }}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                          editCategoriaId === c.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                        }`}>
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const subs = categorias.find((c) => c.id === editCategoriaId)?.subcategorias_servicio ?? []
                    return subs.length > 0 ? (
                      <select value={editSubcategoriaId} onChange={(e) => setEditSubcategoriaId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                        <option value="">Sin subcategoría</option>
                        {subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      </select>
                    ) : null
                  })()}
                  <div className="flex gap-2">
                    <button onClick={() => guardarCampoOrden('categoria')} disabled={savingOrden}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {savingOrden ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => { setEditingOrden(null); setEditCategoriaId(orden.categoria_servicio_id ?? ''); setEditSubcategoriaId(orden.subcategoria_servicio_id ?? '') }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Tipo de ingreso</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {orden.categorias_servicio?.nombre
                        ? <>{orden.categorias_servicio.nombre}{orden.subcategorias_servicio && <span className="text-gray-500 font-normal"> · {orden.subcategorias_servicio.nombre}</span>}</>
                        : <span className="text-gray-400 italic font-normal">Sin tipo</span>
                      }
                    </p>
                  </div>
                  <button onClick={() => setEditingOrden('categoria')} className="text-gray-400 hover:text-blue-600 p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Descripción */}
            <div className="px-5 py-3">
              {editingOrden === 'descripcion' ? (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 font-medium">Descripción del trabajo</label>
                  <textarea autoFocus value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)}
                    rows={3} placeholder="Describe el trabajo..."
                    className="w-full px-3 py-2 border border-blue-400 rounded-lg text-sm resize-none focus:outline-none" />
                  <div className="flex gap-2">
                    <button onClick={() => guardarCampoOrden('descripcion')} disabled={savingOrden}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {savingOrden ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => { setEditingOrden(null); setEditDescripcion(orden.descripcion ?? '') }}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400">Descripción del trabajo</p>
                    <p className="text-sm text-gray-900 mt-0.5 whitespace-pre-wrap">
                      {orden.descripcion || <span className="text-gray-400 italic">Sin descripción</span>}
                    </p>
                  </div>
                  <button onClick={() => setEditingOrden('descripcion')} className="text-gray-400 hover:text-blue-600 p-1 flex-shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Medios */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Fotos y videos</h2>
            <MediaGallery medios={medios} onDelete={handleDeleteMedio} />
          </div>

          {/* ── REPUESTOS ── */}
          <div className="rounded-xl border-2 border-blue-100 overflow-hidden">
            {/* Header azul */}
            <div className="bg-blue-600 px-5 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-blue-200 uppercase tracking-widest">Sección 1</p>
                <h2 className="text-white font-bold text-base">Ingresa los repuestos</h2>
              </div>
              <button
                onClick={() => setShowConsulta(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-blue-700 hover:bg-blue-50 rounded-lg text-sm font-semibold transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar
              </button>
            </div>

            <div className="bg-white">
              {repuestosItems.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <svg className="w-8 h-8 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                  </svg>
                  <p className="text-sm">Sin repuestos — usa el botón Agregar</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase border-b bg-blue-50">
                      <th className="text-left py-2 px-4 font-medium">Detalle</th>
                      <th className="text-left py-2 px-4 font-medium">Origen</th>
                      <th className="text-center py-2 px-4 font-medium">Cant</th>
                      <th className="text-right py-2 px-4 font-medium">P. Venta</th>
                      <th className="text-center py-2 px-3 font-medium">Etiqueta</th>
                      <th className="py-2 px-3 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {repuestosItems.map((item) => (
                      editingItem?.id === item.id ? (
                        <tr key={item.id} className="border-b bg-blue-50">
                          <td className="py-2 px-3" colSpan={2}>
                            <input
                              value={editingItem.descripcion}
                              onChange={(e) => setEditingItem({ ...editingItem, descripcion: e.target.value })}
                              autoFocus
                              className="w-full px-2 py-1.5 border border-blue-400 rounded-lg text-sm focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-3 text-center text-gray-500 text-sm">{item.cantidad}</td>
                          <td className="py-2 px-3">
                            <input
                              type="text" inputMode="numeric"
                              value={editingItem.precio ? '$' + parseInt(editingItem.precio || '0', 10).toLocaleString('es-CO') : ''}
                              onChange={(e) => setEditingItem({ ...editingItem, precio: e.target.value.replace(/\D/g, '') })}
                              className="w-full px-2 py-1.5 border border-blue-400 rounded-lg text-sm font-mono text-right focus:outline-none"
                            />
                          </td>
                          <td />
                          <td className="py-2 px-3">
                            <div className="flex gap-1 justify-end">
                              <button onClick={handleEditItem} className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-semibold">OK</button>
                              <button onClick={() => setEditingItem(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">✕</button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={item.id} className="border-b hover:bg-gray-50 group">
                          <td className="py-3 px-4 text-gray-800">{item.descripcion}</td>
                          <td className="py-3 px-4">
                            <Badge variant={item.origen === 'uma' ? 'blue' : 'amber'}>
                              {item.origen === 'uma' ? 'UMA' : 'Externo'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center text-gray-600">{item.cantidad}</td>
                          <td className="py-3 px-4 text-right font-semibold">{formatCOP(item.precio_venta * item.cantidad)}</td>
                          <td className="py-3 px-3">
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={() => handleEstadoRepuesto(item, item.estado_repuesto === 'pedido' ? null : 'pedido')}
                                title="Marcar como pedido / quitar"
                                className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors ${
                                  item.estado_repuesto === 'pedido'
                                    ? 'bg-amber-400 text-white'
                                    : 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                                }`}
                              >
                                ⏳ Pedido
                              </button>
                              <button
                                onClick={() => handleEstadoRepuesto(item, item.estado_repuesto === 'ok' ? null : 'ok')}
                                title="Marcar como disponible / quitar"
                                className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                                  item.estado_repuesto === 'ok'
                                    ? 'bg-green-500 text-white'
                                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                                }`}
                              >
                                ✅ OK
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditingItem({ id: item.id, descripcion: item.descripcion, precio: String(item.precio_venta) })}
                                className="text-gray-400 hover:text-blue-600 p-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button onClick={() => handleDeleteItem(item)} className="text-gray-400 hover:text-red-500 p-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              )}
              <div className="px-5 py-3 border-t bg-blue-50 flex justify-between text-sm font-semibold">
                <span className="text-blue-700">Subtotal repuestos</span>
                <span className="text-blue-900">{formatCOP(totalRepuestos)}</span>
              </div>
            </div>
          </div>

          {/* ── MANO DE OBRA ── */}
          <div className="rounded-xl border-2 border-orange-100 overflow-hidden">
            {/* Header naranja */}
            <div className="bg-orange-500 px-5 py-3.5">
              <p className="text-xs font-semibold text-orange-200 uppercase tracking-widest">Sección 2</p>
              <h2 className="text-white font-bold text-base">Ingresa la mano de obra</h2>
            </div>

            <div className="bg-white">
              {manoObraItems.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase border-b bg-orange-50">
                      <th className="text-left py-2 px-4 font-medium">Descripción</th>
                      <th className="text-right py-2 px-4 font-medium">Valor</th>
                      <th className="py-2 px-3 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {manoObraItems.map((item) => (
                      editingItem?.id === item.id ? (
                        <tr key={item.id} className="border-b bg-orange-50">
                          <td className="py-2 px-3">
                            <input
                              value={editingItem.descripcion}
                              onChange={(e) => setEditingItem({ ...editingItem, descripcion: e.target.value })}
                              autoFocus
                              className="w-full px-2 py-1.5 border border-orange-400 rounded-lg text-sm focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text" inputMode="numeric"
                              value={editingItem.precio ? '$' + parseInt(editingItem.precio || '0', 10).toLocaleString('es-CO') : ''}
                              onChange={(e) => setEditingItem({ ...editingItem, precio: e.target.value.replace(/\D/g, '') })}
                              className="w-full px-2 py-1.5 border border-orange-400 rounded-lg text-sm font-mono text-right focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex gap-1 justify-end">
                              <button onClick={handleEditItem} className="px-2 py-1 bg-orange-500 text-white rounded text-xs font-semibold">OK</button>
                              <button onClick={() => setEditingItem(null)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">✕</button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={item.id} className="border-b hover:bg-gray-50 group">
                          <td className="py-3 px-4 text-gray-800">{item.descripcion}</td>
                          <td className="py-3 px-4 text-right font-semibold">{formatCOP(item.precio_venta)}</td>
                          <td className="py-3 px-3">
                            <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditingItem({ id: item.id, descripcion: item.descripcion, precio: String(item.precio_venta) })}
                                className="text-gray-400 hover:text-orange-500 p-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button onClick={() => handleDeleteItem(item)} className="text-gray-400 hover:text-red-500 p-1">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              )}

              {/* Formulario agregar mano de obra */}
              <div className="px-5 py-4 flex gap-2 items-end border-t border-gray-50">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Descripción</label>
                  <input
                    value={moDescripcion}
                    onChange={(e) => setMoDescripcion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddManoObra()}
                    placeholder="Ej: Cambio de aceite, Revisión de frenos..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <div className="w-36">
                  <label className="text-xs text-gray-500 mb-1 block">Valor</label>
                  <input
                    type="text" inputMode="numeric"
                    value={moValor ? '$' + parseInt(moValor || '0', 10).toLocaleString('es-CO') : ''}
                    onChange={(e) => setMoValor(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddManoObra()}
                    placeholder="$0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              <button
                onClick={handleAddManoObra}
                disabled={savingMO || !moDescripcion.trim() || !moValor}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {savingMO ? '...' : '+ Agregar'}
              </button>
            </div>

              {manoObraItems.length === 0 && !moDescripcion && (
                <div className="pb-6 text-center text-gray-400">
                  <svg className="w-8 h-8 mx-auto mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-sm">Completa descripción y valor para agregar</p>
                </div>
              )}

            <div className="px-5 py-3 border-t bg-orange-50 flex justify-between text-sm font-semibold">
              <span className="text-orange-700">Subtotal mano de obra</span>
              <span className="text-orange-900">{formatCOP(totalManoObra)}</span>
            </div>
          </div>
          </div>

          {/* ── TOTAL GENERAL ── */}
          <div className="bg-gray-900 rounded-xl px-5 py-4 space-y-1.5">
            {costoTotal > 0 && (
              <div className="flex justify-between text-sm text-gray-400">
                <span>Costo repuestos</span>
                <span>{formatCOP(costoTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-gray-300">
              <span>Repuestos</span>
              <span>{formatCOP(totalRepuestos)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-300">
              <span>Mano de obra</span>
              <span>{formatCOP(totalManoObra)}</span>
            </div>
            <div className="flex justify-between font-bold text-white text-base pt-1 border-t border-gray-700">
              <span>Total</span>
              <span>{formatCOP(total)}</span>
            </div>
            {costoTotal > 0 && total > 0 && (
              <div className="flex justify-between text-sm text-green-400">
                <span>Margen</span>
                <span>{formatCOP(total - costoTotal)} ({Math.round((1 - costoTotal / total) * 100)}%)</span>
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha — Teléfono, Estado y Pago */}
        <div className="space-y-4">
          {/* Teléfono del cliente */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-2">
            <h2 className="font-semibold text-gray-900">Teléfono cliente</h2>
            <input
              type="tel"
              inputMode="numeric"
              value={formatTelefono(telefono)}
              onChange={(e) => setTelefono(soloDigitos(e.target.value))}
              onCopy={(e) => { e.preventDefault(); navigator.clipboard.writeText(telefono) }}
              placeholder="(310) 000-0000"
              maxLength={14}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono tracking-wide ${
                !telefono ? 'border-amber-300 bg-amber-50 placeholder-amber-400' : 'border-gray-200'
              }`}
            />
            {!telefono && (
              <p className="text-xs text-amber-600">Importante: agrega el número para contactar al cliente</p>
            )}
          </div>

          {/* # Orden UMA — solo para órdenes UMA */}
          {esUMA && (
            <div className={`bg-white rounded-xl border p-5 space-y-3 ${numerosOrdenUMA.length === 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900"># Orden UMA</h2>
                {numerosOrdenUMA.length === 0 && (
                  <span className="text-xs text-amber-600 font-medium">Requerido</span>
                )}
              </div>

              {/* Lista de números ingresados */}
              {numerosOrdenUMA.length > 0 && (
                <div className="space-y-1">
                  {numerosOrdenUMA.map((num, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-1.5">
                      <span className="font-mono text-sm font-semibold text-blue-800">{num}</span>
                      <button
                        onClick={() => setNumerosOrdenUMA((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-blue-300 hover:text-red-500 transition-colors ml-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input para agregar */}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={nuevoNumOrden}
                  onChange={(e) => setNuevoNumOrden(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && nuevoNumOrden.trim()) {
                      const num = nuevoNumOrden.trim()
                      if (!numerosOrdenUMA.includes(num)) {
                        setNumerosOrdenUMA((prev) => [...prev, num])
                      }
                      setNuevoNumOrden('')
                    }
                  }}
                  placeholder="Ej: 349384"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={() => {
                    const num = nuevoNumOrden.trim()
                    if (!num) return
                    if (!numerosOrdenUMA.includes(num)) {
                      setNumerosOrdenUMA((prev) => [...prev, num])
                    }
                    setNuevoNumOrden('')
                  }}
                  disabled={!nuevoNumOrden.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  + Add
                </button>
              </div>
              <p className="text-xs text-gray-400">Presiona Enter o + Add para agregar. Puedes ingresar varios.</p>
            </div>
          )}

          {/* Estado */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Estado</h2>
            <div className="space-y-2">
              {([
                { value: 'falta_revision', label: 'Falta revisión' },
                { value: 'en_proceso', label: 'En proceso' },
                { value: 'pendiente', label: 'Pendiente' },
                { value: 'listo', label: 'Finalizado' },
              ] as { value: EstadoOrden; label: string }[]).map((s) => {
                const tieneRepPendientes = s.value === 'listo' &&
                  items.some((i) => i.origen !== 'mano_obra' && i.estado_repuesto === 'pedido')
                return (
                  <button
                    key={s.value}
                    onClick={() => setEstado(s.value)}
                    disabled={tieneRepPendientes}
                    title={tieneRepPendientes ? 'Hay repuestos marcados como Pedido que aún no han llegado' : undefined}
                    className={`w-full py-2 px-3 rounded-lg text-sm font-medium text-left transition-colors ${
                      tieneRepPendientes
                        ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        : estado === s.value
                          ? 'bg-blue-700 text-white'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {s.label}
                    {tieneRepPendientes && <span className="ml-2 text-xs text-amber-400">⏳ rep. pendientes</span>}
                  </button>
                )
              })}
            </div>
            {estado === 'pendiente' && (
              <input
                value={motivoPendiente}
                onChange={(e) => setMotivoPendiente(e.target.value)}
                placeholder="Motivo pendiente *"
                className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm"
              />
            )}
          </div>

          {/* Pago */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900">Pago</h2>
            <div className="space-y-2">
              {(['pagado', 'abono', 'pendiente'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setEstadoPago(s)}
                  className={`w-full py-2 px-3 rounded-lg text-sm font-medium text-left transition-colors ${
                    estadoPago === s ? 'bg-blue-700 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {s === 'pagado' ? 'Pagado' : s === 'abono' ? 'Abono' : 'Pendiente'}
                </button>
              ))}
            </div>
            {estadoPago === 'abono' && (
              <>
                <div>
                  <label className="text-xs text-gray-600">Valor abono</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatAbonoDisplay(valorAbono)}
                    onChange={(e) => setValorAbono(soloDigitos(e.target.value))}
                    placeholder="$0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mt-1 font-mono"
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Saldo pendiente</span>
                  <span className="font-semibold text-red-600">{formatCOP(saldo)}</span>
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-gray-600">Método de pago</label>
              <select
                value={metodoPagoId}
                onChange={(e) => setMetodoPagoId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mt-1"
              >
                <option value="">Sin especificar</option>
                {metodosPago.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>

            {/* Notas internas */}
            <div>
              <label className="text-xs text-gray-600">Notas internas</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones, recordatorios, detalles adicionales..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mt-1 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <Button className="w-full" onClick={handleGuardar} loading={saving}>
              Guardar cambios
            </Button>

            {savedOk && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Datos guardados correctamente
              </div>
            )}
          </div>

          {/* Info mecánico */}
          {orden.usuarios && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
              <span className="font-medium">Mecánico: </span>{(orden.usuarios as { nombre: string }).nombre}
            </div>
          )}
        </div>
      </div>

      {/* Modal consulta repuestos */}
      {profile?.tenant_id && (
        <ConsultaRepuestos
          open={showConsulta}
          onClose={() => { setShowConsulta(false); cargar() }}
          tenantId={profile.tenant_id}
          onAdd={handleAddItem}
        />
      )}

      {/* Modal historial de cambios */}
      {showAudit && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={() => setShowAudit(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white h-full w-full max-w-md shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del panel */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="font-bold text-gray-900">Historial de cambios</h3>
                <p className="text-xs text-gray-400 mt-0.5">Orden #{orden.numero} · {orden.placa ?? '—'}</p>
              </div>
              <button
                onClick={() => setShowAudit(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Lista de entradas */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingAudit ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="animate-pulse border-l-2 border-gray-200 pl-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-gray-100 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              ) : auditLog.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm">Sin historial disponible</p>
                </div>
              ) : (
                auditLog.map((entry) => {
                  const diffs = entry.valor_anterior && entry.valor_nuevo
                    ? getDiff(entry.valor_anterior, entry.valor_nuevo)
                    : []
                  return (
                    <div key={entry.id} className="border-l-2 border-blue-200 pl-3 py-0.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-gray-800 font-medium leading-snug">
                          {entry.descripcion ?? entry.tipo}
                        </p>
                        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                          {formatAuditDate(entry.created_at)}
                        </span>
                      </div>
                      {diffs.map((d, i) => (
                        <p key={i} className="text-xs text-gray-500 leading-relaxed">
                          <span className="font-semibold text-gray-600">{d.field}:</span>{' '}
                          <span className="line-through text-red-400">{d.from}</span>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="text-green-600 font-medium">{d.to}</span>
                        </p>
                      ))}
                      {entry.usuarios && (
                        <p className="text-xs text-gray-400">
                          por {(entry.usuarios as { nombre: string; email: string }).email}
                        </p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
