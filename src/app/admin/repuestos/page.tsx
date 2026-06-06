'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'

type Tab = 'catalogo' | 'ventas'
type FiltroOrigen = 'todos' | 'uma' | 'terceros'
type VistaAgrupacion = 'placa' | 'cliente'

// ─── CATÁLOGO ────────────────────────────────────────────────
interface ItemCatalogo {
  id: string
  tipo: 'uma' | 'externo'
  codigo: string | null
  nombre: string
  precio_venta: number | null
  costo: number | null
  stock: number | null
  activo?: boolean
}

// ─── VENTAS ──────────────────────────────────────────────────
interface ItemVenta {
  id: string
  descripcion: string
  origen: 'uma' | 'externo' | 'mano_obra'
  cantidad: number
  costo: number
  precio_venta: number
  created_at: string
  ordenes: {
    id: string
    numero: number
    placa: string | null
    cliente: string
    cedula: string | null
    celular: string | null
    tipo_orden: string
    created_at: string
  } | null
}

interface GrupoVenta {
  clave: string
  label: string
  sublabel: string | null
  items: ItemVenta[]
  total: number
  expandido: boolean
}

interface AuditEntry {
  id: string
  tipo: string
  descripcion: string | null
  valor_anterior: Record<string, unknown> | null
  valor_nuevo: Record<string, unknown> | null
  created_at: string
  usuarios: { nombre: string; email: string } | null
}

function formatAuditDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function soloD(v: string) { return v.replace(/\D/g, '') }

export default function AdminRepuestosPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [tab, setTab] = useState<Tab>('ventas')
  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigen>('todos')
  const [busqueda, setBusqueda] = useState('')

  // Catálogo
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([])
  const [loadingCat, setLoadingCat] = useState(false)

  // Ventas
  const [grupos, setGrupos] = useState<GrupoVenta[]>([])
  const [vistaAgrupacion, setVistaAgrupacion] = useState<VistaAgrupacion>('placa')
  const [loadingVentas, setLoadingVentas] = useState(false)
  // Edición de ítems
  const [editingItem, setEditingItem] = useState<{ id: string; descripcion: string; precio: string; cantidad: string } | null>(null)
  const [savingItem, setSavingItem] = useState(false)
  // Historial
  const [showAudit, setShowAudit] = useState(false)
  const [auditGrupoLabel, setAuditGrupoLabel] = useState('')
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)
  // Fechas
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  // CSV
  const [loadingCSV, setLoadingCSV] = useState(false)

  // ─── Catálogo ────────────────────────────────────────────
  const cargarCatalogo = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoadingCat(true)

    const [{ data: uma }, { data: ext }] = await Promise.all([
      supabase
        .from('repuestos_uma')
        .select('id, codigo, descripcion, precio_publico_iva, precio_distribuidor_sin_iva, cantidad, activo')
        .eq('tenant_id', profile.tenant_id)
        .order('codigo')
        .limit(500),
      supabase
        .from('repuestos_externos')
        .select('id, codigo, nombre, ultimo_costo, ultimo_precio_venta')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(300),
    ])

    const umaItems: ItemCatalogo[] = (uma ?? []).map((r: {id: string; codigo: string; descripcion: string; precio_publico_iva: number | null; precio_distribuidor_sin_iva: number | null; cantidad: number; activo: boolean}) => ({
      id: r.id,
      tipo: 'uma' as const,
      codigo: r.codigo,
      nombre: r.descripcion,
      precio_venta: r.precio_publico_iva,
      costo: r.precio_distribuidor_sin_iva,
      stock: r.cantidad,
      activo: r.activo,
    }))

    const extItems: ItemCatalogo[] = (ext ?? []).map((r: {id: string; codigo: string | null; nombre: string; ultimo_costo: number | null; ultimo_precio_venta: number | null}) => ({
      id: r.id,
      tipo: 'externo' as const,
      codigo: r.codigo,
      nombre: r.nombre,
      precio_venta: r.ultimo_precio_venta,
      costo: r.ultimo_costo,
      stock: null,
    }))

    let todos: ItemCatalogo[] = [...umaItems, ...extItems]
    if (filtroOrigen === 'uma') todos = umaItems
    else if (filtroOrigen === 'terceros') todos = extItems

    if (busqueda) {
      const b = busqueda.toLowerCase()
      todos = todos.filter((i) => i.nombre.toLowerCase().includes(b) || (i.codigo?.toLowerCase().includes(b) ?? false))
    }

    setCatalogo(todos)
    setLoadingCat(false)
  }, [profile?.tenant_id, filtroOrigen, busqueda])

  // ─── Ventas ──────────────────────────────────────────────
  const cargarVentas = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoadingVentas(true)

    let query = supabase
      .from('items_orden')
      .select(`
        id, descripcion, origen, cantidad, costo, precio_venta, created_at,
        ordenes!inner(id, numero, placa, cliente, cedula, celular, tipo_orden, created_at, tenant_id)
      `)
      .eq('ordenes.tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(500)

    if (filtroOrigen === 'uma') query = query.eq('origen', 'uma')
    else if (filtroOrigen === 'terceros') query = query.eq('origen', 'externo')
    if (fechaDesde) query = query.gte('ordenes.created_at', fechaDesde)
    if (fechaHasta) query = query.lte('ordenes.created_at', fechaHasta + 'T23:59:59')

    const { data } = await query
    let items = (data as unknown as ItemVenta[]) ?? []

    if (busqueda) {
      const b = busqueda.toLowerCase()
      items = items.filter((i) =>
        i.ordenes?.placa?.toLowerCase().includes(b) ||
        i.ordenes?.cliente?.toLowerCase().includes(b) ||
        i.ordenes?.cedula?.toLowerCase().includes(b) ||
        i.ordenes?.celular?.toLowerCase().includes(b) ||
        i.descripcion.toLowerCase().includes(b)
      )
    }

    const map = new Map<string, ItemVenta[]>()
    for (const item of items) {
      const clave = vistaAgrupacion === 'placa'
        ? (item.ordenes?.placa ?? 'Sin placa')
        : (item.ordenes?.cliente ?? 'Sin cliente')
      if (!map.has(clave)) map.set(clave, [])
      map.get(clave)!.push(item)
    }

    setGrupos(
      Array.from(map.entries()).map(([clave, its]) => ({
        clave,
        label: clave,
        sublabel: vistaAgrupacion === 'placa'
          ? (its[0]?.ordenes?.cliente ?? null)
          : (its[0]?.ordenes?.placa ?? null),
        items: its,
        total: its.reduce((s, i) => s + i.precio_venta * i.cantidad, 0),
        expandido: false,
      }))
    )
    setLoadingVentas(false)
  }, [profile?.tenant_id, filtroOrigen, busqueda, vistaAgrupacion, fechaDesde, fechaHasta])

  useEffect(() => {
    if (tab === 'catalogo') cargarCatalogo()
    else cargarVentas()
  }, [tab, cargarCatalogo, cargarVentas])

  const toggleGrupo = (clave: string) => {
    setGrupos((prev) => prev.map((g) => g.clave === clave ? { ...g, expandido: !g.expandido } : g))
  }

  const handleDeleteItem = async (item: ItemVenta) => {
    if (item.ordenes?.tipo_orden !== 'venta_repuestos') return
    if (!confirm(`¿Eliminar "${item.descripcion}"?`)) return
    await supabase.from('items_orden').delete().eq('id', item.id)
    if (item.ordenes) {
      const { data: rest } = await supabase
        .from('items_orden').select('precio_venta, cantidad').eq('orden_id', item.ordenes.id)
      const newTotal = ((rest as { precio_venta: number; cantidad: number }[]) ?? [])
        .reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      await supabase.from('ordenes').update({ valor_total: newTotal }).eq('id', item.ordenes.id)
    }
    await cargarVentas()
  }

  const handleSaveEdit = async () => {
    if (!editingItem) return
    setSavingItem(true)
    const precio = parseInt(soloD(editingItem.precio) || '0', 10)
    const cantidad = Math.max(1, parseInt(editingItem.cantidad) || 1)
    await supabase.from('items_orden').update({
      descripcion: editingItem.descripcion.trim(),
      precio_venta: precio,
      cantidad,
    }).eq('id', editingItem.id)
    const item = grupos.flatMap((g) => g.items).find((i) => i.id === editingItem.id)
    if (item?.ordenes) {
      const { data: all } = await supabase
        .from('items_orden').select('precio_venta, cantidad').eq('orden_id', item.ordenes.id)
      const newTotal = ((all as { precio_venta: number; cantidad: number }[]) ?? [])
        .reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
      await supabase.from('ordenes').update({ valor_total: newTotal }).eq('id', item.ordenes.id)
    }
    setEditingItem(null)
    setSavingItem(false)
    await cargarVentas()
  }

  const openAudit = async (grupo: GrupoVenta) => {
    // Solo órdenes de venta directa (excluir ST)
    const ventaItems = grupo.items.filter((i) => i.ordenes?.tipo_orden === 'venta_repuestos')
    const orderIds = [...new Set(ventaItems.map((i) => i.ordenes!.id))]

    setAuditGrupoLabel(grupo.label)
    setShowAudit(true)
    setAuditLog([])
    setLoadingAudit(true)
    if (orderIds.length === 0) { setLoadingAudit(false); return }

    const sel = 'id, tipo, descripcion, valor_anterior, valor_nuevo, created_at, usuarios(nombre, email)'
    const inClause = `(${orderIds.join(',')})`

    // Q1: cambios a la orden misma (estado, pago, etc.)
    // Q2: ítems editados o eliminados — usa valor_anterior->>'orden_id' para capturar
    //     incluso ítems que ya no existen en el estado actual
    const [r1, r2] = await Promise.all([
      supabase.from('auditoria').select(sel)
        .in('registro_id', orderIds)
        .eq('tabla', 'ordenes')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('auditoria').select(sel)
        .eq('tabla', 'items_orden')
        .filter('valor_anterior->>orden_id', 'in', inClause)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const all = [
      ...((r1.data as unknown as AuditEntry[]) ?? []),
      ...((r2.data as unknown as AuditEntry[]) ?? []),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    setAuditLog(all)
    setLoadingAudit(false)
  }

  const handleDescargarCSV = () => {
    const allItems = grupos.flatMap((g) => g.items)
    if (allItems.length === 0) return
    setLoadingCSV(true)
    const headers = [
      'Fecha', '# Orden', 'Tipo', 'Placa', 'Cliente', 'Cédula', 'Celular',
      'Descripción repuesto', 'Origen', 'Cantidad', 'P. Unitario', 'Total ítem', 'Costo unitario', 'Margen ítem',
    ]
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = allItems.map((item) => {
      const o = item.ordenes
      const total = item.precio_venta * item.cantidad
      const margen = total - item.costo * item.cantidad
      return [
        o ? new Date(o.created_at).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '',
        o ? String(o.numero) : '',
        o?.tipo_orden === 'venta_repuestos' ? 'Venta directa' : 'Servicio técnico',
        o?.placa ?? '',
        o?.cliente ?? '',
        o?.cedula ?? '',
        o?.celular ?? '',
        item.descripcion,
        item.origen === 'uma' ? 'UMA' : item.origen === 'externo' ? 'Externo' : 'Mano de obra',
        String(item.cantidad),
        String(item.precio_venta),
        String(total),
        String(item.costo),
        String(margen),
      ].map(esc).join(',')
    })
    const csv = '﻿' + [headers.map(esc).join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `repuestos_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setLoadingCSV(false)
  }

  const totalVentas = grupos.reduce((s, g) => s + g.total, 0)
  const totalItems = grupos.reduce((s, g) => s + g.items.length, 0)

  const FiltroOrigenes = () => (
    <div className="flex gap-2 items-center">
      <span className="text-xs text-gray-500 font-medium">Origen:</span>
      {([
        { value: 'todos', label: 'Todos' },
        { value: 'uma', label: 'UMA' },
        { value: 'terceros', label: 'Terceros' },
      ] as { value: FiltroOrigen; label: string }[]).map((f) => (
        <button
          key={f.value}
          onClick={() => setFiltroOrigen(f.value)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            filtroOrigen === f.value
              ? f.value === 'uma' ? 'bg-blue-700 text-white'
              : f.value === 'terceros' ? 'bg-amber-500 text-white'
              : 'bg-gray-800 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Repuestos</h1>
        <Link
          href="/admin/repuestos/nueva-venta"
          className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-amber-600"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva venta directa
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {([
          { value: 'ventas', label: 'Historial ventas' },
          { value: 'catalogo', label: 'Catálogo' },
        ] as { value: Tab; label: string }[]).map((t) => (
          <button
            key={t.value}
            onClick={() => { setTab(t.value); setBusqueda(''); setFiltroOrigen('todos') }}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.value
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Búsqueda + filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={tab === 'catalogo' ? 'Buscar por código o nombre...' : 'Buscar por placa, cliente, cédula o celular...'}
          className="w-full max-w-sm px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <FiltroOrigenes />
      </div>

      {/* ─── TAB CATÁLOGO ─── */}
      {tab === 'catalogo' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 text-xs text-gray-500">
            {loadingCat ? 'Cargando...' : `${catalogo.length} repuestos`}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                <th className="text-left py-2 px-5 font-medium">Código</th>
                <th className="text-left py-2 px-3 font-medium">Nombre</th>
                <th className="text-left py-2 px-3 font-medium">Tipo</th>
                <th className="text-center py-2 px-3 font-medium">Stock</th>
                <th className="text-right py-2 px-3 font-medium">Costo</th>
                <th className="text-right py-2 px-5 font-medium">P. Venta</th>
              </tr>
            </thead>
            <tbody>
              {loadingCat ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-3 px-3"><div className="h-4 bg-gray-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : catalogo.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400">Sin repuestos en catálogo</td></tr>
              ) : (
                catalogo.map((r) => (
                  <tr key={r.id} className={`border-b hover:bg-gray-50 ${r.activo === false ? 'opacity-40' : ''}`}>
                    <td className="py-2.5 px-5 font-mono text-xs text-gray-500">{r.codigo ?? '—'}</td>
                    <td className="py-2.5 px-3 text-gray-800 max-w-xs truncate">{r.nombre}</td>
                    <td className="py-2.5 px-3">
                      <Badge variant={r.tipo === 'uma' ? 'blue' : 'amber'}>
                        {r.tipo === 'uma' ? 'UMA' : 'Externo'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-center text-gray-600">{r.stock ?? '—'}</td>
                    <td className="py-2.5 px-3 text-right text-gray-500">{r.costo != null ? formatCOP(r.costo) : '—'}</td>
                    <td className="py-2.5 px-5 text-right font-semibold text-gray-900">{r.precio_venta != null ? formatCOP(r.precio_venta) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── TAB VENTAS ─── */}
      {tab === 'ventas' && (
        <>
          {/* Sub-controles ventas */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 font-medium">Agrupar:</span>
              {([
                { value: 'placa', label: 'Por placa' },
                { value: 'cliente', label: 'Por cliente' },
              ] as { value: VistaAgrupacion; label: string }[]).map((f) => (
                <button
                  key={f.value}
                  onClick={() => setVistaAgrupacion(f.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    vistaAgrupacion === f.value ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {/* Filtro fechas */}
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500 font-medium">Fechas:</span>
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
            <button
              onClick={handleDescargarCSV}
              disabled={loadingCSV || grupos.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              title="Descargar CSV de los registros visibles"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {loadingCSV ? 'Generando...' : 'CSV'}
            </button>
            {!loadingVentas && (
              <span className="text-xs text-gray-500 ml-auto">
                {totalItems} ítems · {formatCOP(totalVentas)} total vendido
              </span>
            )}
          </div>

          {loadingVentas ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
                  <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-4 bg-gray-100 rounded w-48" />
                </div>
              ))}
            </div>
          ) : grupos.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">Sin ventas registradas{busqueda ? ` para "${busqueda}"` : ''}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {grupos.map((grupo) => (
                <div key={grupo.clave} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => toggleGrupo(grupo.clave)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg font-bold text-gray-900 font-mono">{grupo.label}</span>
                      {grupo.sublabel && (
                        <span className="text-sm text-gray-500 truncate">{grupo.sublabel}</span>
                      )}
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                        {grupo.items.length} ítem{grupo.items.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Abrir detalle — solo para grupos de una única venta directa */}
                      {(() => {
                        const ventaIds = [...new Set(
                          grupo.items
                            .filter((i) => i.ordenes?.tipo_orden === 'venta_repuestos' && i.ordenes?.id)
                            .map((i) => i.ordenes!.id),
                        )]
                        return ventaIds.length === 1 ? (
                          <Link
                            href={`/admin/repuestos/venta/${ventaIds[0]}`}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Abrir detalle de venta"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </Link>
                        ) : null
                      })()}
                      {/* Reloj — historial */}
                      <button
                        onClick={() => openAudit(grupo)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver historial de cambios"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      <span className="text-sm font-bold text-gray-900">{formatCOP(grupo.total)}</span>
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${grupo.expandido ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        onClick={() => toggleGrupo(grupo.clave)}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {grupo.expandido && (
                    <div className="border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                            <th className="text-left py-2 px-5 font-medium">Repuesto</th>
                            <th className="text-left py-2 px-3 font-medium">Origen</th>
                            <th className="text-left py-2 px-3 font-medium">Pedido / Servicio</th>
                            <th className="text-center py-2 px-3 font-medium">Cant</th>
                            <th className="text-right py-2 px-5 font-medium">Total</th>
                            <th className="py-2 px-3 w-16" />
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.items.map((item) => {
                            const esVentaDirecta = item.ordenes?.tipo_orden === 'venta_repuestos'
                            if (editingItem?.id === item.id) {
                              return (
                                <tr key={item.id} className="border-b bg-amber-50">
                                  <td className="py-2 px-5" colSpan={2}>
                                    <input
                                      autoFocus
                                      value={editingItem.descripcion}
                                      onChange={(e) => setEditingItem({ ...editingItem, descripcion: e.target.value })}
                                      className="w-full px-2 py-1.5 border border-amber-400 rounded-lg text-sm focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-3 text-xs text-gray-400">
                                    {item.ordenes ? `#${item.ordenes.numero}` : '—'}
                                  </td>
                                  <td className="py-2 px-3">
                                    <input
                                      type="number" min={1}
                                      value={editingItem.cantidad}
                                      onChange={(e) => setEditingItem({ ...editingItem, cantidad: e.target.value })}
                                      className="w-14 px-2 py-1.5 border border-amber-400 rounded-lg text-sm text-center focus:outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex items-center border border-amber-400 rounded-lg overflow-hidden bg-white">
                                      <span className="px-1.5 text-gray-400 text-xs border-r border-amber-200 py-1.5">$</span>
                                      <input
                                        type="text" inputMode="numeric"
                                        value={editingItem.precio ? parseInt(editingItem.precio, 10).toLocaleString('es-CO') : ''}
                                        onChange={(e) => setEditingItem({ ...editingItem, precio: soloD(e.target.value) })}
                                        className="w-24 px-2 py-1.5 text-sm font-mono text-right focus:outline-none"
                                      />
                                    </div>
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex gap-1 justify-end">
                                      <button onClick={handleSaveEdit} disabled={savingItem}
                                        className="px-2 py-1 bg-amber-500 text-white rounded text-xs font-semibold disabled:opacity-50">
                                        {savingItem ? '...' : 'OK'}
                                      </button>
                                      <button onClick={() => setEditingItem(null)}
                                        className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">✕</button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            }
                            return (
                              <tr key={item.id} className="border-b hover:bg-gray-50 group">
                                <td className="py-2.5 px-5 text-gray-800">{item.descripcion}</td>
                                <td className="py-2.5 px-3">
                                  <Badge variant={item.origen === 'uma' ? 'blue' : item.origen === 'mano_obra' ? 'gray' : 'amber'}>
                                    {item.origen === 'uma' ? 'UMA' : item.origen === 'mano_obra' ? 'M.O.' : 'Ext.'}
                                  </Badge>
                                </td>
                                <td className="py-2.5 px-3 text-xs">
                                  {item.ordenes ? (
                                    <a
                                      href={esVentaDirecta ? `/admin/repuestos/venta/${item.ordenes.id}` : `/admin/ordenes/${item.ordenes.id}`}
                                      className="flex items-center gap-1.5 hover:text-blue-700"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${esVentaDirecta ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {esVentaDirecta ? 'Venta' : 'ST'}
                                      </span>
                                      <span className="text-gray-500">
                                        #{item.ordenes.numero} · {new Date(item.ordenes.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                                      </span>
                                    </a>
                                  ) : '—'}
                                </td>
                                <td className="py-2.5 px-3 text-center text-gray-600">{item.cantidad}</td>
                                <td className="py-2.5 px-5 text-right font-semibold text-gray-900">
                                  {formatCOP(item.precio_venta * item.cantidad)}
                                </td>
                                <td className="py-2.5 px-3">
                                  {esVentaDirecta && (
                                    <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => setEditingItem({ id: item.id, descripcion: item.descripcion, precio: String(item.precio_venta), cantidad: String(item.cantidad) })}
                                        className="text-gray-400 hover:text-amber-600 p-1"
                                        title="Editar"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(item)}
                                        className="text-gray-400 hover:text-red-500 p-1"
                                        title="Eliminar"
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50">
                            <td colSpan={5} className="py-2.5 px-5 text-xs text-gray-500 font-medium">Subtotal</td>
                            <td className="py-2.5 px-5 text-right font-bold text-gray-900">{formatCOP(grupo.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {/* ─── Modal historial ─── */}
      {showAudit && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={() => setShowAudit(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative bg-white h-full w-full max-w-md shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Historial de cambios</h3>
                <p className="text-xs text-gray-400 mt-0.5">{auditGrupoLabel}</p>
              </div>
              <button onClick={() => setShowAudit(false)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingAudit ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
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
                auditLog.map((entry) => (
                  <div key={entry.id} className="border-l-2 border-amber-200 pl-3 py-0.5 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-gray-800 font-medium leading-snug">
                        {entry.descripcion ?? entry.tipo}
                      </p>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                        {formatAuditDate(entry.created_at)}
                      </span>
                    </div>
                    {entry.usuarios && (
                      <p className="text-xs text-gray-400">
                        por {(entry.usuarios as { nombre: string; email: string }).email}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
