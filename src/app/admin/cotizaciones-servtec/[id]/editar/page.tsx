'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'
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
  subgrupo: string | null; precio_publico_iva: number; tipo: string
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

function cop(n: number) { return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }) }
let keyCounter = 0
function nextKey() { return String(++keyCounter) }
type TipoAdd = 'repuesto_uma' | 'repuesto_externo' | 'mano_obra'

function MoneyInput({ rawValue, onRawChange, placeholder = '$0', className = '' }: {
  rawValue: string; onRawChange: (v: string) => void; placeholder?: string; className?: string
}) {
  const [focused, setFocused] = React.useState(false)
  const [display, setDisplay] = React.useState(rawValue)
  function fmt(v: string) {
    const n = parseFloat(v.replace(/[^0-9]/g, ''))
    return isNaN(n) ? '' : n.toLocaleString('es-CO')
  }
  React.useEffect(() => { if (!focused) setDisplay(fmt(rawValue)) }, [rawValue, focused])
  return (
    <input type="text" inputMode="numeric" value={display}
      onChange={e => { const r = e.target.value.replace(/[^0-9]/g, ''); setDisplay(r); onRawChange(r) }}
      onFocus={() => { setFocused(true); setDisplay(rawValue || '') }}
      onBlur={() => { setFocused(false); setDisplay(fmt(rawValue)) }}
      placeholder={placeholder} className={className} />
  )
}

function EditableCell({ value, min = 0, integer = false, className = '', onCommit }: {
  value: number; min?: number; integer?: boolean; className?: string; onCommit: (v: number) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [val, setVal] = React.useState(String(value))
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => { if (!editing) setVal(String(value)) }, [value, editing])
  React.useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  function commit() {
    const n = integer ? parseInt(val) : parseFloat(val.replace(/[^0-9]/g, ''))
    if (!isNaN(n) && n >= min) onCommit(n); else setVal(String(value))
    setEditing(false)
  }
  return editing ? (
    <input ref={inputRef} type="text" inputMode="numeric" value={val}
      onChange={e => setVal(e.target.value.replace(/[^0-9]/g, ''))} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(String(value)); setEditing(false) } }}
      className={`border border-blue-400 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`} />
  ) : (
    <button onClick={() => { setEditing(true); setVal(String(value)) }} title="Clic para editar"
      className="hover:text-blue-700 hover:underline decoration-dashed underline-offset-2 transition-colors group">
      {integer ? value : value.toLocaleString('es-CO')}
      <span className="text-[9px] text-blue-300 group-hover:text-blue-500 ml-0.5">✏️</span>
    </button>
  )
}

function SortableRow({ item, onDelete, onPriceChange, onQtyChange }: {
  item: Item; onDelete: () => void
  onPriceChange: (key: string, p: number) => void
  onQtyChange: (key: string, q: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._key })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const minPrice = item.tipo === 'repuesto_uma' ? (item.precio_catalogo ?? 0) : item.tipo === 'repuesto_externo' ? (item.precio_proveedor ?? 0) : 0
  return (
    <tr ref={setNodeRef} style={style} className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-1 py-1.5 w-6 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500" {...attributes} {...listeners}>
        <svg viewBox="0 0 16 16" className="w-4 h-4 mx-auto" fill="currentColor">
          <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
          <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
          <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
        </svg>
      </td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${item.tipo === 'repuesto_uma' ? 'bg-blue-100 text-blue-700' : item.tipo === 'repuesto_externo' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
          {item.tipo === 'repuesto_uma' ? 'UMA' : item.tipo === 'repuesto_externo' ? 'Ext.' : 'M.O.'}
        </span>
      </td>
      <td className="px-2 py-1.5 font-mono text-xs text-gray-500 whitespace-nowrap">{item.referencia || '—'}</td>
      <td className="px-2 py-2 text-gray-800 text-sm">{item.descripcion}</td>
      <td className="px-2 py-1.5 text-center text-sm">
        <EditableCell value={item.cantidad} min={1} integer className="w-14 text-center" onCommit={v => onQtyChange(item._key, v)} />
      </td>
      <td className="px-2 py-1.5 text-right text-gray-400 text-xs whitespace-nowrap">{item.precio_proveedor ? cop(item.precio_proveedor) : '—'}</td>
      <td className="px-2 py-1.5 text-right text-sm">
        <EditableCell value={item.precio_venta} min={minPrice} className="w-28 text-right" onCommit={v => onPriceChange(item._key, v)} />
      </td>
      <td className="px-2 py-1.5 text-right font-bold text-emerald-700 text-sm whitespace-nowrap">{cop(item.precio_venta * item.cantidad)}</td>
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

export default function EditarCotizacionServTecPage() {
  const { profile } = useAuth()
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const cotizacionId = params.id as string

  const [loadingData, setLoadingData] = useState(true)
  const [clienteBusq, setClienteBusq] = useState('')
  const [clientesSug, setClientesSug] = useState<ClienteSugerido[]>([])
  const [clienteId, setClienteId]     = useState<string | null>(null)
  const [cliNombre, setCliNombre]     = useState('')
  const [cliCelular, setCliCelular]   = useState('')
  const [cliEmail, setCliEmail]       = useState('')
  const [tipoAdd, setTipoAdd]         = useState<TipoAdd>('repuesto_uma')
  const [umaBusq, setUmaBusq]         = useState('')
  const [umaResultados, setUmaResultados] = useState<UmaItem[]>([])
  const [umaCargando, setUmaCargando] = useState(false)
  const [umaSeleccionada, setUmaSeleccionada] = useState<UmaItem | null>(null)
  const [umaPrecioVenta, setUmaPrecioVenta]   = useState('')
  const [umaCantidad, setUmaCantidad]         = useState('1')
  const [extDescripcion, setExtDescripcion]   = useState('')
  const [extCostoProv, setExtCostoProv]       = useState('')
  const [extPrecioVenta, setExtPrecioVenta]   = useState('')
  const [extCantidad, setExtCantidad]         = useState('1')
  const [moDescripcion, setMoDescripcion]     = useState('')
  const [moPrecio, setMoPrecio]               = useState('')
  const [moCantidad, setMoCantidad]           = useState('1')
  const [items, setItems]   = useState<Item[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [notas, setNotas]   = useState('')
  const [vigencia, setVigencia] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const busqRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Cargar cotización existente
  useEffect(() => {
    fetch(`/api/cotizaciones-servtec/${cotizacionId}`)
      .then(r => r.json())
      .then(data => {
        setCliNombre(data.cliente_nombre ?? '')
        setCliCelular(data.cliente_celular ?? '')
        setCliEmail(data.cliente_email ?? '')
        setClienteId(data.cliente_id ?? null)
        setNotas(data.notas ?? '')
        setVigencia(data.vigencia_dias ?? 30)
        setItems((data.items ?? []).map((i: Record<string, unknown>) => ({
          _key: nextKey(),
          tipo: i.tipo as Item['tipo'],
          uma_id: i.uma_id as string | undefined,
          referencia: String(i.referencia ?? ''),
          descripcion: String(i.descripcion ?? ''),
          cantidad: Number(i.cantidad ?? 1),
          precio_proveedor: i.precio_proveedor ? Number(i.precio_proveedor) : null,
          precio_venta: Number(i.precio_venta ?? 0),
          precio_catalogo: i.precio_proveedor ? Number(i.precio_proveedor) : undefined,
        })))
        setLoadingData(false)
      })
      .catch(() => setLoadingData(false))
  }, [cotizacionId])

  // Búsqueda clientes
  useEffect(() => {
    const q = clienteBusq.trim()
    if (q.length < 2 || !profile?.tenant_id) { setClientesSug([]); return }
    const t = setTimeout(async () => {
      const { data: porNombre } = await supabase.from('clientes').select('id, nombre, celular').eq('tenant_id', profile.tenant_id).ilike('nombre', `%${q}%`).limit(6)
      const { data: motos } = await supabase.from('motos').select('cliente_id, placa').eq('tenant_id', profile.tenant_id).ilike('placa', `%${q}%`).limit(6)
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

  function seleccionarCliente(c: ClienteSugerido) { setClienteId(c.id); setCliNombre(c.nombre ?? ''); setCliCelular(c.celular ?? ''); setClienteBusq(''); setClientesSug([]) }
  function limpiarCliente() { setClienteId(null); setCliNombre(''); setCliCelular(''); setCliEmail('') }

  function buscarUma(q: string) {
    setUmaBusq(q)
    if (busqRef.current) clearTimeout(busqRef.current)
    if (q.trim().length < 2 || !profile?.tenant_id) { setUmaResultados([]); return }
    setUmaCargando(true)
    busqRef.current = setTimeout(async () => {
      const { data } = await supabase.from('repuestos_uma').select('id, codigo, descripcion, subgrupo, precio_publico_iva, tipo').eq('tenant_id', profile.tenant_id).or(`codigo.ilike.%${q}%,descripcion.ilike.%${q}%,subgrupo.ilike.%${q}%`).limit(25)
      setUmaResultados((data ?? []) as UmaItem[]); setUmaCargando(false)
    }, 300)
  }
  function seleccionarUma(item: UmaItem) { setUmaSeleccionada(item); setUmaPrecioVenta(String(item.precio_publico_iva)); setUmaBusq(''); setUmaResultados([]) }

  function agregarUma() {
    if (!umaSeleccionada) return
    const pv = parseFloat(umaPrecioVenta)
    if (isNaN(pv) || pv < umaSeleccionada.precio_publico_iva) { setError(`Precio mínimo: ${cop(umaSeleccionada.precio_publico_iva)}`); return }
    setError(''); setItems(p => [...p, { _key: nextKey(), tipo: 'repuesto_uma', uma_id: umaSeleccionada.id, referencia: umaSeleccionada.codigo, descripcion: umaSeleccionada.descripcion, cantidad: Math.max(1, parseInt(umaCantidad)||1), precio_proveedor: umaSeleccionada.precio_publico_iva, precio_venta: pv, precio_catalogo: umaSeleccionada.precio_publico_iva }])
    setUmaSeleccionada(null); setUmaPrecioVenta(''); setUmaCantidad('1')
  }
  function agregarExterno() {
    if (!extDescripcion.trim() || !extPrecioVenta) return
    setItems(p => [...p, { _key: nextKey(), tipo: 'repuesto_externo', referencia: '', descripcion: extDescripcion.trim(), cantidad: Math.max(1, parseInt(extCantidad)||1), precio_proveedor: extCostoProv ? parseFloat(extCostoProv) : null, precio_venta: parseFloat(extPrecioVenta) }])
    setExtDescripcion(''); setExtCostoProv(''); setExtPrecioVenta(''); setExtCantidad('1')
  }
  function agregarManoObra() {
    if (!moDescripcion.trim() || !moPrecio) return
    setItems(p => [...p, { _key: nextKey(), tipo: 'mano_obra', referencia: '', descripcion: moDescripcion.trim(), cantidad: Math.max(1, parseInt(moCantidad)||1), precio_proveedor: null, precio_venta: parseFloat(moPrecio) }])
    setMoDescripcion(''); setMoPrecio(''); setMoCantidad('1')
  }
  function eliminarItem(key: string) { setItems(p => p.filter(i => i._key !== key)) }
  function cambiarPrecio(key: string, price: number) { setItems(p => p.map(i => i._key === key ? { ...i, precio_venta: price } : i)) }
  function cambiarCantidad(key: string, qty: number) { setItems(p => p.map(i => i._key === key ? { ...i, cantidad: qty } : i)) }

  function onDragStart({ active }: DragStartEvent) { setActiveId(active.id as string) }
  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    setItems(p => { const from = p.findIndex(i => i._key === active.id); const to = p.findIndex(i => i._key === over.id); return arrayMove(p, from, to) })
  }

  const totalVenta     = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalExtCosto  = items.filter(i => i.tipo === 'repuesto_externo').reduce((s, i) => s + (i.precio_proveedor ?? 0) * i.cantidad, 0)
  const activeLead     = activeId ? items.find(i => i._key === activeId) ?? null : null

  async function guardar(abrirPdf = false) {
    if (items.length === 0) { setError('Agrega al menos un ítem'); return }
    if (!cliNombre.trim()) { setError('Ingresa el nombre del cliente'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/cotizaciones-servtec/${cotizacionId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId, cliente_nombre: cliNombre, cliente_celular: cliCelular || null, cliente_email: cliEmail || null, notas: notas || null, vigencia_dias: vigencia, items: items.map(({ _key, precio_catalogo, ...rest }) => rest) }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Error al guardar') }
      if (abrirPdf) window.open(`/admin/cotizaciones-servtec/${cotizacionId}`, '_blank')
      router.push('/admin/cotizaciones-servtec')
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); setSaving(false) }
  }

  if (loadingData) return <div className="p-8 text-center text-gray-400">Cargando cotización...</div>

  const TIPO_LABEL: Record<TipoAdd, string> = { repuesto_uma: 'Repuesto / Lubricante UMA', repuesto_externo: 'Repuesto externo', mano_obra: 'Mano de obra' }

  return (
    <div className="p-5 max-w-5xl mx-auto pb-16">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800">← Volver</button>
        <h1 className="text-xl font-bold text-gray-900">Editar cotización</h1>
      </div>
      {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* CLIENTE */}
      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Cliente</p>
          <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">OPCIONAL</span>
          <span className="text-xs text-amber-600 ml-1">— busca por nombre o placa</span>
        </div>
        {!clienteId && (
          <div className="relative mb-3">
            <input value={clienteBusq} onChange={e => setClienteBusq(e.target.value)} placeholder="🔍 Nombre del cliente o placa..."
              className="w-full border border-amber-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            {clientesSug.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-amber-200 rounded-xl shadow-lg overflow-hidden">
                {clientesSug.map(c => (
                  <button key={c.id} onClick={() => seleccionarCliente(c)} className="w-full text-left px-3 py-2 hover:bg-amber-50 transition-colors border-b border-gray-100 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div><p className="text-sm font-medium text-gray-900">{c.nombre ?? 'Sin nombre'}</p>{c.celular && <p className="text-xs text-gray-400">{c.celular}</p>}</div>
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
          <input value={cliNombre} onChange={e => setCliNombre(e.target.value)} placeholder="Nombre completo *" className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          <div className="grid grid-cols-2 gap-2">
            <input value={cliCelular} onChange={e => setCliCelular(e.target.value)} placeholder="Celular" className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            <input value={cliEmail} onChange={e => setCliEmail(e.target.value)} placeholder="Correo (opcional)" type="email" className="w-full border border-amber-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
        </div>
      </section>

      {/* AGREGAR ÍTEMS */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Agregar ítems</p>
        <div className="flex gap-1.5 mb-4 bg-gray-100 rounded-xl p-1">
          {(['repuesto_uma', 'repuesto_externo', 'mano_obra'] as TipoAdd[]).map(t => (
            <button key={t} onClick={() => setTipoAdd(t)} className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors ${tipoAdd === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{TIPO_LABEL[t]}</button>
          ))}
        </div>
        {tipoAdd === 'repuesto_uma' && (
          <div className="space-y-2">
            {!umaSeleccionada ? (
              <div className="relative">
                <input value={umaBusq} onChange={e => buscarUma(e.target.value)} placeholder="Buscar repuesto o lubricante UMA..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {umaCargando && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
                {umaResultados.length > 0 && (
                  <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {umaResultados.map(u => (
                      <button key={u.id} onClick={() => seleccionarUma(u)} className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0"><p className="text-xs font-mono text-blue-700">{u.codigo}</p><p className="text-sm text-gray-800 truncate">{u.descripcion}</p></div>
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
                  <div><p className="text-xs font-mono text-blue-700">{umaSeleccionada.codigo}</p><p className="text-sm font-semibold text-gray-900">{umaSeleccionada.descripcion}</p><p className="text-xs text-gray-500">Precio catálogo: {cop(umaSeleccionada.precio_publico_iva)}</p></div>
                  <button onClick={() => { setUmaSeleccionada(null); setUmaPrecioVenta('') }} className="text-gray-400 hover:text-gray-700">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">Precio venta c/IVA *</label><MoneyInput rawValue={umaPrecioVenta} onRawChange={setUmaPrecioVenta} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" /></div>
                  <div><label className="text-xs text-gray-500">Cantidad</label><input type="number" value={umaCantidad} onChange={e => setUmaCantidad(e.target.value)} min={1} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" /></div>
                </div>
                <button onClick={agregarUma} className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">+ Agregar</button>
              </div>
            )}
          </div>
        )}
        {tipoAdd === 'repuesto_externo' && (
          <div className="space-y-2">
            <input value={extDescripcion} onChange={e => setExtDescripcion(e.target.value)} placeholder="Descripción del repuesto *" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs text-gray-500">Costo proveedor</label><MoneyInput rawValue={extCostoProv} onRawChange={setExtCostoProv} placeholder="$0" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" /></div>
              <div><label className="text-xs text-gray-500">Precio venta *</label><MoneyInput rawValue={extPrecioVenta} onRawChange={setExtPrecioVenta} placeholder="$0" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" /></div>
              <div><label className="text-xs text-gray-500">Cantidad</label><input type="number" value={extCantidad} onChange={e => setExtCantidad(e.target.value)} min={1} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" /></div>
            </div>
            <button onClick={agregarExterno} disabled={!extDescripcion.trim() || !extPrecioVenta} className="w-full py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">+ Agregar repuesto externo</button>
          </div>
        )}
        {tipoAdd === 'mano_obra' && (
          <div className="space-y-2">
            <input value={moDescripcion} onChange={e => setMoDescripcion(e.target.value)} placeholder="Descripción del servicio *" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-gray-500">Precio *</label><MoneyInput rawValue={moPrecio} onRawChange={setMoPrecio} placeholder="$0" className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" /></div>
              <div><label className="text-xs text-gray-500">Cantidad</label><input type="number" value={moCantidad} onChange={e => setMoCantidad(e.target.value)} min={1} className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" /></div>
            </div>
            <button onClick={agregarManoObra} disabled={!moDescripcion.trim() || !moPrecio} className="w-full py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">+ Agregar mano de obra</button>
          </div>
        )}
      </section>

      {/* LISTA */}
      {items.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Ítems <span className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full text-[10px]">{items.length}</span></p>
          <p className="text-[10px] text-gray-400 mb-3">⠿ Arrastra para reorganizar · Clic en precio o cantidad para editar</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead><tr className="bg-gray-50"><th className="w-6 px-1"></th><th className="text-left px-2 py-1.5 text-xs text-gray-500 font-semibold">Tipo</th><th className="text-left px-2 py-1.5 text-xs text-gray-500 font-semibold">Ref.</th><th className="text-left px-2 py-1.5 text-xs text-gray-500 font-semibold">Descripción</th><th className="text-center px-2 py-1.5 text-xs text-gray-500 font-semibold">Cant.</th><th className="text-right px-2 py-1.5 text-xs text-gray-500 font-semibold">P. Prov.</th><th className="text-right px-2 py-1.5 text-xs text-gray-500 font-semibold">P. Venta</th><th className="text-right px-2 py-1.5 text-xs text-gray-500 font-semibold">Total</th><th className="w-6 px-1"></th></tr></thead>
                <SortableContext items={items.map(i => i._key)} strategy={verticalListSortingStrategy}>
                  <tbody>{items.map(item => <SortableRow key={item._key} item={item} onDelete={() => eliminarItem(item._key)} onPriceChange={cambiarPrecio} onQtyChange={cambiarCantidad} />)}</tbody>
                </SortableContext>
              </table>
            </div>
            <DragOverlay>{activeLead && <table className="text-sm bg-white shadow-lg rounded-lg opacity-90"><tbody><tr><td className="px-2 py-1.5 text-gray-600">{activeLead.descripcion}</td></tr></tbody></table>}</DragOverlay>
          </DndContext>
          <div className="mt-3 border-t border-gray-100 pt-3 flex flex-col items-end gap-1 text-sm">
            {totalExtCosto > 0 && <p className="text-xs text-gray-400">Costo proveedor externos: <span className="font-semibold text-gray-600">{cop(totalExtCosto)}</span></p>}
            <p className="text-base font-bold text-gray-900">Total venta: <span className="text-emerald-700">{cop(totalVenta)}</span></p>
          </div>
        </section>
      )}

      {/* OPCIONES */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
        <div><label className="text-xs text-gray-500 block mb-1">Vigencia (días)</label><input type="number" min={1} max={365} value={vigencia} onChange={e => setVigencia(Number(e.target.value))} className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
        <div className="mt-3"><label className="text-xs text-gray-500 block mb-1">Notas adicionales</label><textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" /></div>
      </section>

      <div className="flex gap-3">
        <button onClick={() => guardar(false)} disabled={saving || items.length === 0} className="flex-1 py-3 bg-gray-700 hover:bg-gray-800 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors">
          {saving ? 'Guardando...' : '💾 Guardar cambios'}
        </button>
        <button onClick={() => guardar(true)} disabled={saving || items.length === 0} className="flex-1 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors">
          {saving ? 'Guardando...' : '📄 Guardar y ver PDF'}
        </button>
      </div>
    </div>
  )
}
