'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

interface OrdenVenta {
  id: string
  numero: number
  placa: string | null
  cliente: string
  cedula: string | null
  celular: string | null
  estado: string
  estado_pago: string
  valor_total: number
  valor_abono: number | null
  tipo_orden: string
  created_at: string
  metodo_pago_id: string | null
  metodos_pago: { id: string; nombre: string } | null
}

interface ItemVenta {
  id: string
  descripcion: string
  origen: 'uma' | 'externo' | 'mano_obra'
  cantidad: number
  costo: number
  precio_venta: number
}

interface MetodoPago {
  id: string
  nombre: string
}

function soloD(v: string) { return v.replace(/\D/g, '') }

function formatCelular(digits: string): string {
  const d = soloD(digits).slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

const ESTADO_PAGO_COLOR: Record<string, string> = {
  pagado: 'bg-green-100 text-green-700',
  abono: 'bg-amber-100 text-amber-700',
  pendiente: 'bg-red-100 text-red-700',
}

const ESTADO_PAGO_LABEL: Record<string, string> = {
  pagado: 'Pagado',
  abono: 'Abono',
  pendiente: 'Pendiente',
}

export default function VentaDetallePage() {
  const params = useParams()
  const ordenId = String(params.id)
  const router = useRouter()
  const { profile } = useAuth()
  const supabase = createClient()

  const [orden, setOrden] = useState<OrdenVenta | null>(null)
  const [items, setItems] = useState<ItemVenta[]>([])
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Form pago
  const [estadoPago, setEstadoPago] = useState<'pagado' | 'abono' | 'pendiente'>('pendiente')
  const [valorAbono, setValorAbono] = useState('0')
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [errorPago, setErrorPago] = useState('')

  // Edición de ítems
  const [editingItem, setEditingItem] = useState<{
    id: string
    descripcion: string
    precio: string
    cantidad: string
  } | null>(null)
  const [savingItem, setSavingItem] = useState(false)

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const [{ data: o, error: oErr }, { data: i }, { data: mp }] = await Promise.all([
      supabase
        .from('ordenes')
        .select('id, numero, placa, cliente, cedula, celular, estado, estado_pago, valor_total, valor_abono, tipo_orden, created_at, metodo_pago_id, metodos_pago(id, nombre)')
        .eq('id', ordenId)
        .single(),
      supabase
        .from('items_orden')
        .select('id, descripcion, origen, cantidad, costo, precio_venta')
        .eq('orden_id', ordenId)
        .order('created_at'),
      supabase
        .from('metodos_pago')
        .select('id, nombre')
        .eq('tenant_id', profile.tenant_id)
        .eq('activo', true),
    ])

    if (oErr || !o || (o as unknown as OrdenVenta).tipo_orden !== 'venta_repuestos') {
      setNotFound(true)
      setLoading(false)
      return
    }

    const ord = o as unknown as OrdenVenta
    setOrden(ord)
    setEstadoPago(ord.estado_pago as 'pagado' | 'abono' | 'pendiente')
    setValorAbono(String(ord.valor_abono ?? 0))
    setMetodoPagoId(ord.metodo_pago_id ?? '')
    setItems((i as unknown as ItemVenta[]) ?? [])
    setMetodosPago((mp as MetodoPago[]) ?? [])
    setLoading(false)
  }, [ordenId, profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  const handleGuardarPago = async () => {
    if (!orden) return
    setErrorPago('')
    if (estadoPago === 'abono') {
      const v = parseInt(soloD(valorAbono) || '0', 10)
      if (v <= 0) { setErrorPago('Ingresa el valor del abono.'); return }
    }
    setSaving(true)
    const valorAbonoNum =
      estadoPago === 'abono'
        ? parseInt(soloD(valorAbono) || '0', 10)
        : estadoPago === 'pagado'
        ? orden.valor_total ?? 0
        : 0
    await supabase
      .from('ordenes')
      .update({
        estado_pago: estadoPago,
        valor_abono: valorAbonoNum,
        metodo_pago_id: metodoPagoId || null,
      })
      .eq('id', ordenId)
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 3000)
    setSaving(false)
    await cargar()
  }

  const handleDeleteItem = async (item: ItemVenta) => {
    if (!confirm(`¿Eliminar "${item.descripcion}"?`)) return
    await supabase.from('items_orden').delete().eq('id', item.id)
    const remaining = items.filter((i) => i.id !== item.id)
    const newTotal = remaining.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
    await supabase.from('ordenes').update({ valor_total: newTotal }).eq('id', ordenId)
    await cargar()
  }

  const handleSaveEdit = async () => {
    if (!editingItem) return
    setSavingItem(true)
    const precio = parseInt(soloD(editingItem.precio) || '0', 10)
    const cantidad = Math.max(1, parseInt(editingItem.cantidad) || 1)
    await supabase
      .from('items_orden')
      .update({ descripcion: editingItem.descripcion.trim(), precio_venta: precio, cantidad })
      .eq('id', editingItem.id)
    const { data: all } = await supabase
      .from('items_orden')
      .select('precio_venta, cantidad')
      .eq('orden_id', ordenId)
    const newTotal = ((all as { precio_venta: number; cantidad: number }[]) ?? []).reduce(
      (s, i) => s + i.precio_venta * i.cantidad,
      0,
    )
    await supabase.from('ordenes').update({ valor_total: newTotal }).eq('id', ordenId)
    setEditingItem(null)
    setSavingItem(false)
    await cargar()
  }

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        {[1, 2, 3].map((k) => (
          <div key={k} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-5 w-32 bg-gray-200 rounded mb-3" />
            <div className="h-4 w-full bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-20">
        <p className="text-gray-500 text-sm mb-4">Venta no encontrada.</p>
        <button onClick={() => router.back()} className="text-blue-600 text-sm hover:underline">
          ← Volver
        </button>
      </div>
    )
  }

  const total = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const saldo =
    orden!.estado_pago === 'abono' && (orden!.valor_abono ?? 0) > 0
      ? Math.max(0, (orden!.valor_total ?? 0) - (orden!.valor_abono ?? 0))
      : null

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900">Venta #{orden!.numero}</h1>
            {orden!.placa && (
              <span className="font-mono text-sm bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                {orden!.placa}
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                ESTADO_PAGO_COLOR[orden!.estado_pago] ?? 'bg-gray-100 text-gray-600'
              }`}
            >
              {ESTADO_PAGO_LABEL[orden!.estado_pago] ?? orden!.estado_pago}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{formatFecha(orden!.created_at)}</p>
        </div>
      </div>

      {/* Datos del cliente */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Datos del cliente</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-xs text-gray-500">Nombre</span>
            <p className="font-medium text-gray-800">{orden!.cliente || '—'}</p>
          </div>
          {orden!.cedula && (
            <div>
              <span className="text-xs text-gray-500">Cédula</span>
              <p className="font-medium text-gray-800">{orden!.cedula}</p>
            </div>
          )}
          {orden!.celular && (
            <div>
              <span className="text-xs text-gray-500">Celular</span>
              <p className="font-mono text-gray-800">{formatCelular(orden!.celular)}</p>
            </div>
          )}
          {orden!.placa && (
            <div>
              <span className="text-xs text-gray-500">Placa</span>
              <p className="font-mono font-bold text-gray-800">{orden!.placa}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Repuestos</h2>
          <span className="text-xs text-gray-500">
            {items.length} ítem{items.length !== 1 ? 's' : ''}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
              <th className="text-left py-2 px-5 font-medium">Descripción</th>
              <th className="text-left py-2 px-3 font-medium">Origen</th>
              <th className="text-center py-2 px-3 font-medium">Cant</th>
              <th className="text-right py-2 px-5 font-medium">Total</th>
              <th className="py-2 px-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-400 text-sm">
                  Sin repuestos
                </td>
              </tr>
            ) : (
              items.map((item) => {
                if (editingItem?.id === item.id) {
                  return (
                    <tr key={item.id} className="border-b bg-amber-50">
                      <td className="py-2 px-5" colSpan={2}>
                        <input
                          autoFocus
                          value={editingItem.descripcion}
                          onChange={(e) =>
                            setEditingItem({ ...editingItem, descripcion: e.target.value })
                          }
                          className="w-full px-2 py-1.5 border border-amber-400 rounded-lg text-sm focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min={1}
                          value={editingItem.cantidad}
                          onChange={(e) =>
                            setEditingItem({ ...editingItem, cantidad: e.target.value })
                          }
                          className="w-14 px-2 py-1.5 border border-amber-400 rounded-lg text-sm text-center focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center border border-amber-400 rounded-lg overflow-hidden bg-white">
                          <span className="px-1.5 text-gray-400 text-xs border-r border-amber-200 py-1.5">$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={
                              editingItem.precio
                                ? parseInt(editingItem.precio, 10).toLocaleString('es-CO')
                                : ''
                            }
                            onChange={(e) =>
                              setEditingItem({ ...editingItem, precio: soloD(e.target.value) })
                            }
                            className="w-24 px-2 py-1.5 text-sm font-mono text-right focus:outline-none"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={handleSaveEdit}
                            disabled={savingItem}
                            className="px-2 py-1 bg-amber-500 text-white rounded text-xs font-semibold disabled:opacity-50"
                          >
                            {savingItem ? '...' : 'OK'}
                          </button>
                          <button
                            onClick={() => setEditingItem(null)}
                            className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={item.id} className="border-b hover:bg-gray-50 group">
                    <td className="py-2.5 px-5 text-gray-800">{item.descripcion}</td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant={
                          item.origen === 'uma'
                            ? 'blue'
                            : item.origen === 'mano_obra'
                            ? 'gray'
                            : 'amber'
                        }
                      >
                        {item.origen === 'uma' ? 'UMA' : item.origen === 'mano_obra' ? 'M.O.' : 'Ext.'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-center text-gray-600">{item.cantidad}</td>
                    <td className="py-2.5 px-5 text-right font-semibold text-gray-900">
                      {formatCOP(item.precio_venta * item.cantidad)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            setEditingItem({
                              id: item.id,
                              descripcion: item.descripcion,
                              precio: String(item.precio_venta),
                              cantidad: String(item.cantidad),
                            })
                          }
                          className="text-gray-400 hover:text-amber-600 p-1"
                          title="Editar"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="text-gray-400 hover:text-red-500 p-1"
                          title="Eliminar"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pago */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Pago</h2>

        <div className="flex gap-2">
          {(['pagado', 'abono', 'pendiente'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setEstadoPago(s); setErrorPago('') }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                estadoPago === s
                  ? 'bg-blue-700 text-white'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {s === 'pagado' ? 'Pagado' : s === 'abono' ? 'Abono' : 'Pendiente'}
            </button>
          ))}
        </div>

        {estadoPago === 'abono' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Valor del abono</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-blue-400">
              <span className="px-3 text-gray-400 text-sm border-r border-gray-100 py-2.5">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={
                  valorAbono && valorAbono !== '0'
                    ? parseInt(soloD(valorAbono) || '0', 10).toLocaleString('es-CO')
                    : ''
                }
                onChange={(e) => setValorAbono(soloD(e.target.value))}
                placeholder="0"
                className="flex-1 px-3 py-2.5 text-sm font-mono text-right focus:outline-none"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
          <select
            value={metodoPagoId}
            onChange={(e) => setMetodoPagoId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">Sin especificar</option>
            {metodosPago.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        {errorPago && <p className="text-sm text-red-600">{errorPago}</p>}

        <Button className="w-full" onClick={handleGuardarPago} loading={saving}>
          {savedOk ? '✓ Cambios guardados' : 'Guardar cambios de pago'}
        </Button>
      </div>

      {/* Total */}
      <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
        <div>
          <span className="text-sm text-gray-600">
            {items.length} ítem{items.length !== 1 ? 's' : ''}
          </span>
          {saldo !== null && (
            <p className="text-xs text-amber-600 mt-0.5">
              Abono: {formatCOP(orden!.valor_abono ?? 0)} · Saldo pendiente:{' '}
              {formatCOP(saldo)}
            </p>
          )}
        </div>
        <span className="text-xl font-bold text-gray-900">{formatCOP(total)}</span>
      </div>
    </div>
  )
}
