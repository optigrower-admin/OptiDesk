'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { registrarEntrada } from '@/lib/movimientos'

type Tab = 'historial' | 'compra'
type FiltroTipo = 'todos' | 'entrada' | 'salida'

interface Movimiento {
  id: string
  tipo: 'entrada' | 'salida'
  motivo: string
  cantidad: number
  costo_unitario: number | null
  precio_unitario: number | null
  proveedor: string | null
  numero_factura: string | null
  notas: string | null
  created_at: string
  repuestos_uma: { codigo: string; descripcion: string } | null
  repuestos_externos: { nombre: string } | null
  ordenes: { numero: number } | null
  usuarios: { nombre: string } | null
}

interface RepuestoUMA {
  id: string
  codigo: string
  descripcion: string
  cantidad: number
  precio_publico_sin_iva: number | null
}

const MOTIVO_LABEL: Record<string, string> = {
  compra: 'Compra', devolucion: 'Devolución',
  uso_st: 'Servicio', venta_directa: 'Venta directa', ajuste: 'Ajuste',
}

export default function InventarioPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('historial')
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ entradas: 0, salidas: 0, valorSalidas: 0 })

  // Compra form
  const [repuestos, setRepuestos] = useState<RepuestoUMA[]>([])
  const [busquedaRep, setBusquedaRep] = useState('')
  const [repSeleccionado, setRepSeleccionado] = useState<RepuestoUMA | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [cantidad, setCantidad] = useState('1')
  const [costoUnitario, setCostoUnitario] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [numFactura, setNumFactura] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [exito, setExito] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargarMovimientos = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    let q = supabase
      .from('movimientos_inventario')
      .select(`id, tipo, motivo, cantidad, costo_unitario, precio_unitario, proveedor, numero_factura, notas, created_at,
        repuestos_uma:repuesto_uma_id(codigo, descripcion),
        repuestos_externos:repuesto_externo_id(nombre),
        ordenes:orden_id(numero),
        usuarios:registrado_por(nombre)`)
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (filtroTipo !== 'todos') q = q.eq('tipo', filtroTipo)

    const { data } = await q
    const movs = (data as unknown as Movimiento[]) ?? []
    setMovimientos(movs)

    const mes = new Date()
    mes.setDate(1); mes.setHours(0, 0, 0, 0)
    const movsMes = movs.filter((m) => new Date(m.created_at) >= mes)
    setStats({
      entradas: movsMes.filter((m) => m.tipo === 'entrada').reduce((s, m) => s + m.cantidad, 0),
      salidas: movsMes.filter((m) => m.tipo === 'salida').reduce((s, m) => s + m.cantidad, 0),
      valorSalidas: movsMes.filter((m) => m.tipo === 'salida')
        .reduce((s, m) => s + (m.precio_unitario ?? 0) * m.cantidad, 0),
    })
    setLoading(false)
  }, [profile?.tenant_id, filtroTipo])

  useEffect(() => { cargarMovimientos() }, [cargarMovimientos])

  // Búsqueda repuestos UMA para compra
  useEffect(() => {
    if (!profile?.tenant_id) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      if (!busquedaRep || busquedaRep.length < 2) { setRepuestos([]); return }
      const { data } = await supabase
        .from('repuestos_uma')
        .select('id, codigo, descripcion, cantidad, precio_publico_sin_iva')
        .eq('tenant_id', profile.tenant_id)
        .eq('activo', true)
        .or(`descripcion.ilike.%${busquedaRep}%,codigo.ilike.%${busquedaRep}%`)
        .limit(10)
      setRepuestos((data as RepuestoUMA[]) ?? [])
      setShowDropdown(true)
    }, 300)
  }, [busquedaRep, profile?.tenant_id])

  const handleRegistrarCompra = async () => {
    if (!repSeleccionado || !cantidad || !costoUnitario || !profile?.tenant_id) return
    setSaving(true)
    try {
      await registrarEntrada(supabase, {
        tenantId: profile.tenant_id,
        repuesto_uma_id: repSeleccionado.id,
        cantidad: parseInt(cantidad),
        costo_unitario: parseFloat(costoUnitario),
        precio_unitario: parseFloat(costoUnitario),
        proveedor: proveedor || undefined,
        numero_factura: numFactura || undefined,
        notas: notas || undefined,
        registrado_por: profile.id,
      })
      // Reset form
      setRepSeleccionado(null)
      setBusquedaRep('')
      setCantidad('1')
      setCostoUnitario('')
      setProveedor('')
      setNumFactura('')
      setNotas('')
      setExito(true)
      setTimeout(() => setExito(false), 2500)
      await cargarMovimientos()
    } finally {
      setSaving(false)
    }
  }

  const nombreRepuesto = (m: Movimiento) =>
    m.repuestos_uma?.descripcion ?? m.repuestos_externos?.nombre ?? '—'

  const codigoRepuesto = (m: Movimiento) => m.repuestos_uma?.codigo ?? null

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
        <p className="text-sm text-gray-500">Movimientos de repuestos este mes</p>
      </div>

      {/* Stats del mes */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-green-800">{stats.entradas}</p>
          <p className="text-xs text-green-600 mt-0.5">Unidades compradas</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-blue-800">{stats.salidas}</p>
          <p className="text-xs text-blue-600 mt-0.5">Unidades vendidas/usadas</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-800">{formatCOP(stats.valorSalidas)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Valor en salidas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1 w-fit">
        {([
          { value: 'historial', label: 'Historial movimientos' },
          { value: 'compra', label: 'Registrar compra' },
        ] as { value: Tab; label: string }[]).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: HISTORIAL ── */}
      {tab === 'historial' && (
        <div className="space-y-3">
          {/* Filtro tipo */}
          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500 font-medium">Filtrar:</span>
            {([
              { value: 'todos', label: 'Todos' },
              { value: 'entrada', label: 'Entradas' },
              { value: 'salida', label: 'Salidas' },
            ] as { value: FiltroTipo; label: string }[]).map((f) => (
              <button
                key={f.value}
                onClick={() => setFiltroTipo(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filtroTipo === f.value
                    ? f.value === 'entrada' ? 'bg-green-600 text-white'
                    : f.value === 'salida' ? 'bg-red-500 text-white'
                    : 'bg-gray-800 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-xl h-14 animate-pulse border border-gray-100" />)}
            </div>
          ) : movimientos.length === 0 ? (
            <div className="text-center py-14 text-gray-400 text-sm">
              Sin movimientos registrados. Se generan automáticamente al agregar ítems a órdenes y ventas.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                    <th className="text-left py-2.5 px-4 font-medium">Tipo</th>
                    <th className="text-left py-2.5 px-4 font-medium">Repuesto</th>
                    <th className="text-center py-2.5 px-4 font-medium">Cant.</th>
                    <th className="text-right py-2.5 px-4 font-medium">Costo u.</th>
                    <th className="text-right py-2.5 px-4 font-medium">Precio v.</th>
                    <th className="text-left py-2.5 px-4 font-medium">Origen</th>
                    <th className="text-right py-2.5 px-4 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id} className="border-b hover:bg-gray-50 last:border-0">
                      <td className="py-2.5 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.tipo === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {m.tipo === 'entrada' ? '↑' : '↓'} {m.tipo}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 max-w-[200px]">
                        <p className="text-gray-800 font-medium truncate">{nombreRepuesto(m)}</p>
                        {codigoRepuesto(m) && (
                          <p className="text-xs text-gray-400 font-mono">{codigoRepuesto(m)}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center font-semibold text-gray-800">{m.cantidad}</td>
                      <td className="py-2.5 px-4 text-right text-gray-500">
                        {m.costo_unitario ? formatCOP(m.costo_unitario) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-gray-800">
                        {m.precio_unitario ? formatCOP(m.precio_unitario) : '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="text-xs text-gray-500">
                          <span className={`px-1.5 py-0.5 rounded font-medium ${
                            m.motivo === 'compra' ? 'bg-green-50 text-green-700' :
                            m.motivo === 'devolucion' ? 'bg-amber-50 text-amber-700' :
                            'bg-blue-50 text-blue-700'
                          }`}>{MOTIVO_LABEL[m.motivo] ?? m.motivo}</span>
                          {m.ordenes && (
                            <Link href={`/admin/ordenes/${m.ordenes.numero}`}
                              className="ml-1.5 text-blue-500 hover:underline">
                              #{m.ordenes.numero}
                            </Link>
                          )}
                          {m.proveedor && <span className="ml-1.5 text-gray-400">{m.proveedor}</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right text-xs text-gray-400 whitespace-nowrap">
                        {new Date(m.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                        <span className="text-gray-300 ml-1">
                          {new Date(m.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: REGISTRAR COMPRA ── */}
      {tab === 'compra' && (
        <div className="max-w-lg space-y-4">
          <p className="text-sm text-gray-500">
            Registra una entrada de stock cuando compras repuestos UMA. Actualiza automáticamente el inventario.
          </p>

          {exito && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 font-medium">
              ✓ Compra registrada. Stock actualizado.
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {/* Búsqueda repuesto */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Repuesto UMA *</label>
              {repSeleccionado ? (
                <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-blue-900">{repSeleccionado.descripcion}</p>
                    <p className="text-xs text-blue-600 font-mono">{repSeleccionado.codigo} · Stock actual: {repSeleccionado.cantidad}</p>
                  </div>
                  <button
                    onClick={() => { setRepSeleccionado(null); setBusquedaRep('') }}
                    className="text-blue-400 hover:text-blue-600 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    value={busquedaRep}
                    onChange={(e) => { setBusquedaRep(e.target.value); setShowDropdown(true) }}
                    placeholder="Buscar por nombre o código..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {showDropdown && repuestos.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {repuestos.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => { setRepSeleccionado(r); setBusquedaRep(''); setShowDropdown(false) }}
                          className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors border-b last:border-0"
                        >
                          <p className="text-sm font-medium text-gray-800">{r.descripcion}</p>
                          <p className="text-xs text-gray-500 font-mono">{r.codigo} · Stock: {r.cantidad}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cantidad y costo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cantidad *</label>
                <input
                  type="number"
                  min={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Costo unitario *</label>
                <input
                  type="number"
                  min={0}
                  value={costoUnitario}
                  onChange={(e) => setCostoUnitario(e.target.value)}
                  placeholder="$ 0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>

            {/* Proveedor y factura */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                <input
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  placeholder="Nombre del proveedor"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">N° Factura</label>
                <input
                  value={numFactura}
                  onChange={(e) => setNumFactura(e.target.value)}
                  placeholder="FV-0001"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
              <input
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones opcionales"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            {/* Resumen */}
            {repSeleccionado && cantidad && costoUnitario && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
                <p className="text-green-800 font-medium">
                  Entrada: {cantidad} unidades · Costo total: {formatCOP(parseInt(cantidad) * parseFloat(costoUnitario))}
                </p>
                <p className="text-green-600 text-xs mt-0.5">
                  Stock actual {repSeleccionado.cantidad} → pasará a {repSeleccionado.cantidad + parseInt(cantidad || '0')}
                </p>
              </div>
            )}

            <button
              onClick={handleRegistrarCompra}
              disabled={saving || !repSeleccionado || !cantidad || !costoUnitario}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-200 disabled:text-green-400 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? 'Registrando...' : 'Registrar compra y actualizar stock'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
