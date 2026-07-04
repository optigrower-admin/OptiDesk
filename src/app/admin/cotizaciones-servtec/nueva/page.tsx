'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragStartEvent, PointerSensor,
  useSensor, useSensors, closestCenter, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import React from 'react'

type UmaItem = {
  id: string; codigo: string; descripcion: string
  subgrupo: string | null; precio_publico_iva: number
  tipo: string // 'repuesto' | 'lubricante'
}
type ClienteSugerido = { id: string; nombre: string | null; celular: string | null; placa?: string | null }
type Item = {
  _key: string
  tipo: 'repuesto_uma' | 'repuesto_externo' | 'mano_obra'
  uma_id?: string
  referencia: string
  descripcion: string
  cantidad: number
  precio_proveedor: number | null
  precio_venta: number
  precio_catalogo?: number
}
type BulkRow = { codigo: string; item: UmaItem | null; cantidad: number; incluir: boolean }

function cop(n: number) {
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}
let keyCounter = 0
function nextKey() { return String(++keyCounter) }

type TipoAdd = 'repuesto_uma' | 'repuesto_externo' | 'mano_obra'

/* ── Fila arrastrable con edición de precio ── */
function SortableRow({ item, onDelete, onPriceChange }: {
  item: Item
  onDelete: () => void
  onPriceChange: (key: string, price: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._key })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  const [editingPrice, setEditingPrice] = React.useState(false)
  const [priceVal, setPriceVal]         = React.useState(String(item.precio_venta))
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Piso: UMA → precio catálogo, externo → costo proveedor, mano obra → 0
  const minPrice = item.tipo === 'repuesto_uma'
    ? (item.precio_catalogo ?? 0)
    : item.tipo === 'repuesto_externo'
    ? (item.precio_proveedor ?? 0)
    : 0

  React.useEffect(() => {
    if (!editingPrice) setPriceVal(String(item.precio_venta))
  }, [item.precio_venta, editingPrice])

  React.useEffect(() => {
    if (editingPrice) inputRef.current?.select()
  }, [editingPrice])

  function commitPrice() {
    const p = parseFloat(priceVal.replace(/[^0-9.]/g, ''))
    if (!isNaN(p) && p >= minPrice) {
      onPriceChange(item._key, p)
    } else {
      setPriceVal(String(item.precio_venta)) // revert
    }
    setEditingPrice(false)
  }

  return (
    <tr ref={setNodeRef} style={style} className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-1 py-1.5 w-6 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500" {...attributes} {...listeners}>
        <svg viewBox="0 0 16 16" className="w-4 h-4 mx-auto" fill="currentColor">
          <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
          <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
          <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
        </svg>
      </td>
      <td className="px-2 py-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
          item.tipo === 'repuesto_uma' ? 'bg-blue-100 text-blue-700' :
          item.tipo === 'repuesto_externo' ? 'bg-amber-100 text-amber-700' :
          'bg-purple-100 text-purple-700'
        }`}>
          {item.tipo === 'repuesto_uma' ? 'UMA' : item.tipo === 'repuesto_externo' ? 'Ext.' : 'M.O.'}
        </span>
      </td>
      <td className="px-2 py-1.5 font-mono text-xs text-gray-500 max-w-[80px] truncate">{item.referencia || '—'}</td>
      <td className="px-2 py-1.5 text-gray-800 max-w-[160px] truncate text-sm">{item.descripcion}</td>
      <td className="px-2 py-1.5 text-center text-gray-700 font-medium text-sm">{item.cantidad}</td>
      <td className="px-2 py-1.5 text-right text-gray-400 text-xs">{item.precio_proveedor ? cop(item.precio_proveedor) : '—'}</td>

      {/* Precio de venta — editable al hacer clic */}
      <td className="px-2 py-1.5 text-right">
        {editingPrice ? (
          <input
            ref={inputRef}
            type="number"
            value={priceVal}
            min={minPrice}
            onChange={e => setPriceVal(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={e => { if (e.key === 'Enter') commitPrice(); if (e.key === 'Escape') { setPriceVal(String(item.precio_venta)); setEditingPrice(false) } }}
            className="w-24 border border-blue-400 rounded px-1.5 py-0.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <button
            onClick={() => setEditingPrice(true)}
            title={`Clic para editar precio (mín: ${cop(minPrice)})`}
            className="text-gray-700 text-sm hover:text-blue-700 hover:underline decoration-dashed underline-offset-2 transition-colors"
          >
            {cop(item.precio_venta)}
            <span className="text-[9px] text-blue-400 ml-0.5">✏️</span>
          </button>
        )}
      </td>

      <td className="px-2 py-1.5 text-right font-bold text-emerald-700 text-sm">{cop(item.precio_venta * item.cantidad)}</td>
      <td className="px-1 py-1.5">
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </td>
    </tr>
  )
}

export default function NuevaCotizacionServTecPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const router = useRouter()

  /* ── Cliente ── */
  const [clienteBusq, setClienteBusq]   = useState('')
  const [clientesSug, setClientesSug]   = useState<ClienteSugerido[]>([])
  const [clienteId, setClienteId]       = useState<string | null>(null)
  const [cliNombre, setCliNombre]       = useState('')
  const [cliCelular, setCliCelular]     = useState('')
  const [cliEmail, setCliEmail]         = useState('')

  /* ── Tipo de ítem ── */
  const [tipoAdd, setTipoAdd] = useState<TipoAdd>('repuesto_uma')

  /* ── Búsqueda UMA ── */
  const [umaBusq, setUmaBusq]                   = useState('')
  const [umaResultados, setUmaResultados]       = useState<UmaItem[]>([])
  const [umaCargando, setUmaCargando]           = useState(false)
  const [umaSeleccionada, setUmaSeleccionada]   = useState<UmaItem | null>(null)
  const [umaPrecioVenta, setUmaPrecioVenta]     = useState('')
  const [umaCantidad, setUmaCantidad]           = useState('1')

  /* ── Repuesto externo ── */
  const [extDescripcion, setExtDescripcion] = useState('')
  const [extCostoProv, setExtCostoProv]     = useState('')
  const [extPrecioVenta, setExtPrecioVenta] = useState('')
  const [extCantidad, setExtCantidad]       = useState('1')

  /* ── Mano de obra ── */
  const [moDescripcion, setMoDescripcion] = useState('')
  const [moPrecio, setMoPrecio]           = useState('')
  const [moCantidad, setMoCantidad]       = useState('1')

  /* ── Items con drag ── */
  const [items, setItems]     = useState<Item[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  /* ── Carga masiva ── */
  const [showBulk, setShowBulk]         = useState(false)
  const [bulkTexto, setBulkTexto]       = useState('')
  const [bulkRows, setBulkRows]         = useState<BulkRow[]>([])
  const [bulkCargando, setBulkCargando] = useState(false)

  /* ── General ── */
  const [notas, setNotas]     = useState('')
  const [vigencia, setVigencia] = useState(30)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const busqRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  /* ── Buscar clientes por nombre o placa ── */
  useEffect(() => {
    const q = clienteBusq.trim()
    if (q.length < 2 || !profile?.tenant_id) { setClientesSug([]); return }
    const t = setTimeout(async () => {
      const tid = profile.tenant_id
      const { data: porNombre } = await supabase.from('clientes')
        .select('id, nombre, celular').eq('tenant_id', tid).ilike('nombre', `%${q}%`).limit(6)
      const { data: motos } = await supabase.from('motos')
        .select('cliente_id, placa').eq('tenant_id', tid).ilike('placa', `%${q}%`).limit(6)
      let porPlaca: ClienteSugerido[] = []
      if (motos?.length) {
        const ids = [...new Set(motos.map(m => m.cliente_id).filter(Boolean))]
        if (ids.length) {
          const { data: clis } = await supabase.from('clientes').select('id, nombre, celular').in('id', ids)
          porPlaca = (clis ?? []).map(c => ({ ...c, placa: motos.find(m => m.cliente_id === c.id)?.placa ?? null })) as ClienteSugerido[]
        }
      }
      const map = new Map<string, ClienteSugerido>()
      for (const c of [...(porNombre ?? []), ...porPlaca]) map.set(c.id, c)
      setClientesSug(Array.from(map.values()).slice(0, 8))
    }, 300)
    return () => clearTimeout(t)
  }, [clienteBusq, profile?.tenant_id])

  function seleccionarCliente(c: ClienteSugerido) {
    setClienteId(c.id); setCliNombre(c.nombre ?? ''); setCliCelular(c.celular ?? '')
    setClienteBusq(''); setClientesSug([])
  }
  function limpiarCliente() { setClienteId(null); setCliNombre(''); setCliCelular(''); setCliEmail('') }

  /* ── Búsqueda UMA (repuestos + lubricantes) ── */
  function buscarUma(q: string) {
    setUmaBusq(q)
    if (busqRef.current) clearTimeout(busqRef.current)
    if (q.trim().length < 2 || !profile?.tenant_id) { setUmaResultados([]); return }
    setUmaCargando(true)
    busqRef.current = setTimeout(async () => {
      const { data } = await supabase.from('repuestos_uma')
        .select('id, codigo, descripcion, subgrupo, precio_publico_iva, tipo')
        .eq('tenant_id', profile.tenant_id)
        .or(`codigo.ilike.%${q}%,descripcion.ilike.%${q}%,subgrupo.ilike.%${q}%`)
        .limit(25)
      setUmaResultados((data ?? []) as UmaItem[])
      setUmaCargando(false)
    }, 300)
  }

  function seleccionarUma(item: UmaItem) {
    setUmaSeleccionada(item); setUmaPrecioVenta(String(item.precio_publico_iva))
    setUmaBusq(''); setUmaResultados([])
  }

  /* ── Agregar items ── */
  function agregarUma() {
    if (!umaSeleccionada) return
    const pv = parseFloat(umaPrecioVenta)
    if (isNaN(pv) || pv < umaSeleccionada.precio_publico_iva) {
      setError(`Precio de venta no puede ser menor al catálogo (${cop(umaSeleccionada.precio_publico_iva)})`); return
    }
    setError('')
    setItems(p => [...p, {
      _key: nextKey(), tipo: 'repuesto_uma', uma_id: umaSeleccionada.id,
      referencia: umaSeleccionada.codigo, descripcion: umaSeleccionada.descripcion,
      cantidad: Math.max(1, parseInt(umaCantidad) || 1),
      precio_proveedor: umaSeleccionada.precio_publico_iva,
      precio_venta: pv, precio_catalogo: umaSeleccionada.precio_publico_iva,
    }])
    setUmaSeleccionada(null); setUmaPrecioVenta(''); setUmaCantidad('1')
  }

  function agregarExterno() {
    if (!extDescripcion.trim() || !extPrecioVenta) return
    setItems(p => [...p, {
      _key: nextKey(), tipo: 'repuesto_externo', referencia: '',
      descripcion: extDescripcion.trim(),
      cantidad: Math.max(1, parseInt(extCantidad) || 1),
      precio_proveedor: extCostoProv ? parseFloat(extCostoProv) : null,
      precio_venta: parseFloat(extPrecioVenta),
    }])
    setExtDescripcion(''); setExtCostoProv(''); setExtPrecioVenta(''); setExtCantidad('1')
  }

  function agregarManoObra() {
    if (!moDescripcion.trim() || !moPrecio) return
    setItems(p => [...p, {
      _key: nextKey(), tipo: 'mano_obra', referencia: '',
      descripcion: moDescripcion.trim(),
      cantidad: Math.max(1, parseInt(moCantidad) || 1),
      precio_proveedor: null, precio_venta: parseFloat(moPrecio),
    }])
    setMoDescripcion(''); setMoPrecio(''); setMoCantidad('1')
  }

  function eliminarItem(key: string) { setItems(p => p.filter(i => i._key !== key)) }
  function cambiarPrecio(key: string, price: number) { setItems(p => p.map(i => i._key === key ? { ...i, precio_venta: price } : i)) }

  /* ── Drag & drop ── */
  function onDragStart({ active }: DragStartEvent) { setActiveId(active.id as string) }
  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    setItems(p => {
      const from = p.findIndex(i => i._key === active.id)
      const to   = p.findIndex(i => i._key === over.id)
      return arrayMove(p, from, to)
    })
  }

  /* ── Carga masiva por códigos ── */
  async function buscarBulk() {
    if (!bulkTexto.trim() || !profile?.tenant_id) return
    const codigos = bulkTexto.split('\n').map(l => l.trim()).filter(Boolean)
    if (codigos.length === 0) return
    setBulkCargando(true)
    const rows: BulkRow[] = []
    for (const codigo of codigos) {
      const { data } = await supabase.from('repuestos_uma')
        .select('id, codigo, descripcion, subgrupo, precio_publico_iva, tipo')
        .eq('tenant_id', profile.tenant_id)
        .ilike('codigo', codigo)
        .limit(1)
      rows.push({ codigo, item: (data?.[0] as UmaItem | undefined) ?? null, cantidad: 1, incluir: !!data?.[0] })
    }
    setBulkRows(rows)
    setBulkCargando(false)
  }

  function agregarBulkConfirmados() {
    const nuevos: Item[] = bulkRows
      .filter(r => r.incluir && r.item)
      .map(r => ({
        _key: nextKey(), tipo: 'repuesto_uma' as const,
        uma_id: r.item!.id, referencia: r.item!.codigo,
        descripcion: r.item!.descripcion,
        cantidad: Math.max(1, r.cantidad),
        precio_proveedor: r.item!.precio_publico_iva,
        precio_venta: r.item!.precio_publico_iva,
        precio_catalogo: r.item!.precio_publico_iva,
      }))
    setItems(p => [...p, ...nuevos])
    setBulkRows([]); setBulkTexto(''); setShowBulk(false)
  }

  /* ── Totales desglosados ── */
  const repUma     = items.filter(i => i.tipo === 'repuesto_uma')
  const repExt     = items.filter(i => i.tipo === 'repuesto_externo')
  const manoObra   = items.filter(i => i.tipo === 'mano_obra')
  const totalUmaVenta  = repUma.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalExtVenta  = repExt.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalExtCosto  = repExt.reduce((s, i) => s + (i.precio_proveedor ?? 0) * i.cantidad, 0)
  const totalMO        = manoObra.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalVenta     = totalUmaVenta + totalExtVenta + totalMO

  const activeLead = activeId ? items.find(i => i._key === activeId) ?? null : null

  const TIPO_LABEL: Record<TipoAdd, string> = {
    repuesto_uma: 'Repuesto / Lubricante UMA', repuesto_externo: 'Repuesto externo', mano_obra: 'Mano de obra',
  }

  async function guardarCotizacion(abrirPdf = false) {
    if (items.length === 0) { setError('Agrega al menos un ítem'); return }
    if (!cliNombre.trim()) { setError('Ingresa el nombre del cliente'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/cotizaciones-servtec', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteId, cliente_nombre: cliNombre,
          cliente_celular: cliCelular || null, cliente_email: cliEmail || null,
          notas: notas || null, vigencia_dias: vigencia,
          items: items.map(({ _key, precio_catalogo, ...rest }) => rest),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')
      if (abrirPdf) {
        window.open(`/admin/cotizaciones-servtec/${json.id}`, '_blank')
      }
      router.push('/admin/cotizaciones-servtec')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar'); setSaving(false)
    }
  }

  return (
    <div className="p-5 max-w-3xl mx-auto pb-16">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800">← Volver</button>
        <h1 className="text-xl font-bold text-gray-900">Nueva Cotización S. Técnico</h1>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── CLIENTE (opcional) ── */}
      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Cliente</p>
          <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">OPCIONAL</span>
          <span className="text-xs text-amber-600 ml-1">— busca por nombre o placa</span>
        </div>
        {!clienteId && (
          <div className="relative mb-3">
            <input value={clienteBusq} onChange={e => setClienteBusq(e.target.value)}
              placeholder="🔍 Nombre del cliente o placa del vehículo..."
              className="w-full border border-amber-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder-amber-400" />
            {clientesSug.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-amber-200 rounded-xl shadow-lg overflow-hidden">
                {clientesSug.map(c => (
                  <button key={c.id} onClick={() => seleccionarCliente(c)}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50 transition-colors border-b border-gray-100 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.nombre ?? 'Sin nombre'}</p>
                        {c.celular && <p className="text-xs text-gray-400">{c.celular}</p>}
                      </div>
                      {c.placa && <span className="text-xs font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">{c.placa}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {clienteId && (
          <div className="flex items-center gap-2 mb-3 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2">
            <span className="text-xs text-amber-800 font-semibold flex-1">✓ Cliente vinculado: {cliNombre}</span>
            <button onClick={limpiarCliente} className="text-xs text-amber-600 hover:text-amber-900">Cambiar</button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2">
          <input value={cliNombre} onChange={e => setCliNombre(e.target.value)} placeholder="Nombre completo *"
            className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          <div className="grid grid-cols-2 gap-2">
            <input value={cliCelular} onChange={e => setCliCelular(e.target.value)} placeholder="Celular"
              className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            <input value={cliEmail} onChange={e => setCliEmail(e.target.value)} placeholder="Correo (opcional)" type="email"
              className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
        </div>
      </section>

      {/* ── AGREGAR ÍTEMS ── */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Agregar ítems</p>
          <button onClick={() => { setShowBulk(v => !v); setBulkRows([]) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-xs font-semibold transition-colors">
            📋 Agregar lista de códigos
          </button>
        </div>

        {/* CARGA MASIVA */}
        {showBulk && (
          <div className="mb-4 border border-green-200 bg-green-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-green-800">Pega una columna de Excel con códigos UMA (uno por línea):</p>
            <textarea value={bulkTexto} onChange={e => setBulkTexto(e.target.value)} rows={5}
              placeholder={"ABC-001\nABC-002\nABC-003"}
              className="w-full border border-green-300 bg-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
            <button onClick={buscarBulk} disabled={!bulkTexto.trim() || bulkCargando}
              className="w-full py-2 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">
              {bulkCargando ? 'Buscando...' : '🔍 Buscar en catálogo UMA'}
            </button>

            {bulkRows.length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="text-xs text-green-700 font-semibold">
                  {bulkRows.filter(r => r.item).length} encontrados de {bulkRows.length} códigos
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {bulkRows.map((r, i) => (
                    <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${r.item ? 'bg-white border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                      <input type="checkbox" checked={r.incluir} onChange={e => setBulkRows(p => p.map((x, j) => j === i ? { ...x, incluir: e.target.checked } : x))}
                        disabled={!r.item} className="flex-shrink-0" />
                      {r.item ? (
                        <>
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-blue-700">{r.item.codigo}</span>
                            <span className="text-gray-700 ml-2 truncate">{r.item.descripcion}</span>
                            <span className={`ml-2 text-[10px] px-1 py-0.5 rounded ${r.item.tipo === 'lubricante' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                              {r.item.tipo === 'lubricante' ? '🛢️' : '🔧'}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-emerald-700 flex-shrink-0">{cop(r.item.precio_publico_iva)}</span>
                          <input type="number" value={r.cantidad} min={1}
                            onChange={e => setBulkRows(p => p.map((x, j) => j === i ? { ...x, cantidad: Math.max(1, parseInt(e.target.value) || 1) } : x))}
                            className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        </>
                      ) : (
                        <span className="text-red-600 text-xs flex-1">No encontrado: <strong>{r.codigo}</strong></span>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={agregarBulkConfirmados}
                  className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
                  ✓ Agregar {bulkRows.filter(r => r.incluir && r.item).length} ítem(s) a la lista
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tabs tipo */}
        <div className="flex gap-1.5 mb-4 bg-gray-100 rounded-xl p-1">
          {(['repuesto_uma', 'repuesto_externo', 'mano_obra'] as TipoAdd[]).map(t => (
            <button key={t} onClick={() => setTipoAdd(t)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors ${tipoAdd === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>

        {/* REPUESTO / LUBRICANTE UMA */}
        {tipoAdd === 'repuesto_uma' && (
          <div className="space-y-2">
            {!umaSeleccionada ? (
              <div className="relative">
                <input value={umaBusq} onChange={e => buscarUma(e.target.value)}
                  placeholder="Buscar repuesto o lubricante por código, subtipo o descripción..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {umaCargando && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
                {umaResultados.length > 0 && (
                  <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {umaResultados.map(u => (
                      <button key={u.id} onClick={() => seleccionarUma(u)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-mono text-blue-700">{u.codigo}</p>
                              <span className={`text-[10px] px-1 py-0.5 rounded ${u.tipo === 'lubricante' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                {u.tipo === 'lubricante' ? '🛢️ Lubricante' : '🔧 Repuesto'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-800 truncate">{u.descripcion}</p>
                            {u.subgrupo && <p className="text-xs text-gray-400">{u.subgrupo}</p>}
                          </div>
                          <p className="text-sm font-bold text-emerald-700 flex-shrink-0">{cop(u.precio_publico_iva)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-mono text-blue-700">{umaSeleccionada.codigo}</p>
                      <span className={`text-[10px] px-1 py-0.5 rounded ${umaSeleccionada.tipo === 'lubricante' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                        {umaSeleccionada.tipo === 'lubricante' ? '🛢️' : '🔧'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{umaSeleccionada.descripcion}</p>
                    <p className="text-xs text-gray-500">Precio catálogo: {cop(umaSeleccionada.precio_publico_iva)}</p>
                  </div>
                  <button onClick={() => { setUmaSeleccionada(null); setUmaPrecioVenta('') }} className="text-gray-400 hover:text-gray-700">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Precio venta c/IVA * (≥ catálogo)</label>
                    <input type="number" value={umaPrecioVenta} onChange={e => setUmaPrecioVenta(e.target.value)}
                      min={umaSeleccionada.precio_publico_iva}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Cantidad</label>
                    <input type="number" value={umaCantidad} onChange={e => setUmaCantidad(e.target.value)} min={1}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
                  </div>
                </div>
                <button onClick={agregarUma}
                  className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
                  + Agregar
                </button>
              </div>
            )}
          </div>
        )}

        {/* REPUESTO EXTERNO */}
        {tipoAdd === 'repuesto_externo' && (
          <div className="space-y-2">
            <input value={extDescripcion} onChange={e => setExtDescripcion(e.target.value)} placeholder="Descripción del repuesto *"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500">Costo proveedor (COP)</label>
                <input type="number" value={extCostoProv} onChange={e => setExtCostoProv(e.target.value)} placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Precio venta c/IVA *</label>
                <input type="number" value={extPrecioVenta} onChange={e => setExtPrecioVenta(e.target.value)} placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Cantidad</label>
                <input type="number" value={extCantidad} onChange={e => setExtCantidad(e.target.value)} min={1}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
              </div>
            </div>
            <button onClick={agregarExterno} disabled={!extDescripcion.trim() || !extPrecioVenta}
              className="w-full py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">
              + Agregar repuesto externo
            </button>
          </div>
        )}

        {/* MANO DE OBRA */}
        {tipoAdd === 'mano_obra' && (
          <div className="space-y-2">
            <input value={moDescripcion} onChange={e => setMoDescripcion(e.target.value)} placeholder="Descripción del servicio *"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Precio *</label>
                <input type="number" value={moPrecio} onChange={e => setMoPrecio(e.target.value)} placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Cantidad</label>
                <input type="number" value={moCantidad} onChange={e => setMoCantidad(e.target.value)} min={1}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
              </div>
            </div>
            <button onClick={agregarManoObra} disabled={!moDescripcion.trim() || !moPrecio}
              className="w-full py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">
              + Agregar mano de obra
            </button>
          </div>
        )}
      </section>

      {/* ── LISTA DE ÍTEMS CON DRAG ── */}
      {items.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Ítems <span className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full text-[10px]">{items.length}</span>
          </p>
          <p className="text-[10px] text-gray-400 mb-3">⠿ Arrastra las filas para reorganizar el orden</p>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="w-6 px-1"></th>
                    <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-semibold">Tipo</th>
                    <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-semibold">Ref.</th>
                    <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-semibold">Descripción</th>
                    <th className="text-center px-2 py-1.5 text-xs text-gray-500 font-semibold">Cant.</th>
                    <th className="text-right px-2 py-1.5 text-xs text-gray-500 font-semibold">P. Prov.</th>
                    <th className="text-right px-2 py-1.5 text-xs text-gray-500 font-semibold">P. Venta</th>
                    <th className="text-right px-2 py-1.5 text-xs text-gray-500 font-semibold">Total</th>
                    <th className="w-6 px-1"></th>
                  </tr>
                </thead>
                <SortableContext items={items.map(i => i._key)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {items.map(item => (
                      <SortableRow key={item._key} item={item} onDelete={() => eliminarItem(item._key)} onPriceChange={cambiarPrecio} />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            </div>
            <DragOverlay>
              {activeLead && (
                <table className="w-full text-sm bg-white shadow-lg rounded-lg opacity-90"><tbody>
                  <tr>
                    <td className="px-2 py-1.5 text-xs text-gray-500">{activeLead.referencia}</td>
                    <td className="px-2 py-1.5 text-gray-800">{activeLead.descripcion}</td>
                  </tr>
                </tbody></table>
              )}
            </DragOverlay>
          </DndContext>

          {/* ── Resumen desglosado ── */}
          <div className="mt-3 border-t border-gray-100 pt-3 flex flex-col items-end gap-1 text-sm">
            {totalUmaVenta > 0 && (
              <p className="text-xs text-gray-400">
                Repuestos/Lubricantes UMA: <span className="font-semibold text-gray-600">{cop(totalUmaVenta)}</span>
              </p>
            )}
            {totalExtVenta > 0 && (
              <p className="text-xs text-gray-400">
                Rep. externos — costo: <span className="font-semibold text-gray-500">{cop(totalExtCosto)}</span>
                {' · '} venta: <span className="font-semibold text-gray-600">{cop(totalExtVenta)}</span>
              </p>
            )}
            {totalMO > 0 && (
              <p className="text-xs text-gray-400">
                Mano de obra: <span className="font-semibold text-gray-600">{cop(totalMO)}</span>
              </p>
            )}
            <p className="text-base font-bold text-gray-900 mt-1">
              Total venta: <span className="text-emerald-700">{cop(totalVenta)}</span>
            </p>
          </div>
        </section>
      )}

      {/* ── OPCIONES ── */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Vigencia (días)</label>
          <input type="number" min={1} max={365} value={vigencia} onChange={e => setVigencia(Number(e.target.value))}
            className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500 block mb-1">Notas adicionales (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
      </section>

      <div className="flex gap-3">
        <button onClick={() => guardarCotizacion(false)} disabled={saving || items.length === 0}
          className="flex-1 py-3 bg-gray-700 hover:bg-gray-800 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
          {saving
            ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Guardando...</>
            : '💾 Guardar'
          }
        </button>
        <button onClick={() => guardarCotizacion(true)} disabled={saving || items.length === 0}
          className="flex-1 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
          {saving
            ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Guardando...</>
            : '📄 Guardar y ver PDF'
          }
        </button>
      </div>
    </div>
  )
}
