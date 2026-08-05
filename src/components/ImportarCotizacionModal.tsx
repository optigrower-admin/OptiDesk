'use client'

import { useState, useEffect } from 'react'
import { formatCOP } from '@/lib/utils'

type CotListItem = {
  id: string
  numero: number
  fecha_generacion: string
  cliente_nombre: string | null
  estado: string
}

type CotItem = {
  id: string
  tipo: 'repuesto_uma' | 'repuesto_externo' | 'mano_obra'
  uma_id: string | null
  descripcion: string
  cantidad: number
  precio_proveedor: number | null
  precio_venta: number
}

export type ItemToImport = {
  tipo: CotItem['tipo']
  uma_id: string | null
  descripcion: string
  cantidad: number
  costo: number
  precio_venta: number
  metodo_pago_id?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  onImport: (items: ItemToImport[]) => Promise<void>
  metodosPago: { id: string; nombre: string }[]
}

function pad(n: number) { return String(n).padStart(4, '0') }

const TIPO_LABEL: Record<string, string> = {
  repuesto_uma: 'UMA',
  repuesto_externo: 'Externo',
  mano_obra: 'Mano obra',
}
const TIPO_COLOR: Record<string, string> = {
  repuesto_uma: 'bg-blue-100 text-blue-700',
  repuesto_externo: 'bg-amber-100 text-amber-700',
  mano_obra: 'bg-purple-100 text-purple-700',
}

export function ImportarCotizacionModal({ open, onClose, onImport, metodosPago }: Props) {
  const [lista, setLista] = useState<CotListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [cotId, setCotId] = useState<string | null>(null)
  const [items, setItems] = useState<CotItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [metodoPagoExterno, setMetodoPagoExterno] = useState('')
  const [errorMetodo, setErrorMetodo] = useState('')

  useEffect(() => {
    if (!open) {
      setCotId(null)
      setItems([])
      setSeleccionados(new Set())
      setMetodoPagoExterno('')
      setErrorMetodo('')
      return
    }
    setLoading(true)
    fetch('/api/cotizaciones-servtec')
      .then(r => r.json())
      .then(d => setLista(d ?? []))
      .finally(() => setLoading(false))
  }, [open])

  async function seleccionar(id: string) {
    if (cotId === id) { setCotId(null); setItems([]); setSeleccionados(new Set()); return }
    setCotId(id)
    setLoadingItems(true)
    setItems([])
    setSeleccionados(new Set())
    const r = await fetch(`/api/cotizaciones-servtec/${id}`)
    const d = await r.json()
    const itms = (d.items ?? []) as CotItem[]
    setItems(itms)
    setSeleccionados(new Set(itms.map(i => i.id)))
    setLoadingItems(false)
  }

  function toggleItem(id: string) {
    setSeleccionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function toggleTodos() {
    setSeleccionados(prev =>
      prev.size === items.length ? new Set() : new Set(items.map(i => i.id))
    )
  }

  const seleccionadosItems = items.filter(i => seleccionados.has(i.id))
  const tieneExterno = seleccionadosItems.some(i => i.tipo === 'repuesto_externo')

  async function importar() {
    if (tieneExterno && !metodoPagoExterno) {
      setErrorMetodo('Selecciona con qué método se les pagó a los proveedores de los ítems externos')
      return
    }
    setErrorMetodo('')
    const toImport: ItemToImport[] = seleccionadosItems
      .map(i => ({
        tipo: i.tipo,
        uma_id: i.uma_id,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        costo: i.precio_proveedor ?? 0,
        precio_venta: i.precio_venta,
        metodo_pago_id: i.tipo === 'repuesto_externo' ? metodoPagoExterno : null,
      }))
    if (!toImport.length) return
    setImportando(true)
    try {
      await onImport(toImport)
      onClose()
    } finally {
      setImportando(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-base">Importar cotización S.T.</h2>
            <p className="text-xs text-gray-400 mt-0.5">Selecciona una cotización para importar sus ítems</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Cargando cotizaciones...</div>
          ) : lista.length === 0 ? (
            <div className="py-12 text-center px-6">
              <div className="text-4xl mb-3">🔧</div>
              <p className="text-gray-600 font-semibold text-sm">Sin cotizaciones de servicio técnico</p>
              <p className="text-xs text-gray-400 mt-1">Crea una desde el módulo <strong>Cotizaciones S.T.</strong></p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {lista.map(c => (
                <div key={c.id}>
                  <button
                    onClick={() => seleccionar(c.id)}
                    className={`w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 transition-colors ${cotId === c.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900">ST-{pad(c.numero)}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${c.estado === 'generada' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {c.estado}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 font-medium truncate mt-0.5">{c.cliente_nombre ?? 'Sin nombre'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(c.fecha_generacion).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <svg className={`w-4 h-4 text-blue-400 flex-shrink-0 transition-transform ${cotId === c.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {cotId === c.id && (
                    <div className="bg-blue-50/50 border-t border-blue-100 px-4 pt-2 pb-3">
                      {loadingItems ? (
                        <p className="text-xs text-gray-400 py-3 text-center">Cargando ítems...</p>
                      ) : items.length === 0 ? (
                        <p className="text-xs text-gray-400 py-3 text-center">Esta cotización no tiene ítems.</p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {items.length} ítem{items.length !== 1 ? 's' : ''}
                            </p>
                            <button onClick={toggleTodos} className="text-xs text-blue-600 hover:underline font-medium">
                              {seleccionados.size === items.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {items.map(item => (
                              <label
                                key={item.id}
                                className={`flex items-start gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all border ${seleccionados.has(item.id) ? 'bg-white border-blue-200 shadow-sm' : 'bg-white/40 border-transparent opacity-50'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={seleccionados.has(item.id)}
                                  onChange={() => toggleItem(item.id)}
                                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${TIPO_COLOR[item.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                                      {TIPO_LABEL[item.tipo] ?? item.tipo}
                                    </span>
                                    <span className="text-sm font-medium text-gray-900 leading-snug">{item.descripcion}</span>
                                  </div>
                                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                                    <span>×{item.cantidad}</span>
                                    {(item.precio_proveedor ?? 0) > 0 && (
                                      <span>Costo: {formatCOP(item.precio_proveedor!)}</span>
                                    )}
                                    <span className="font-semibold text-gray-700">Venta: {formatCOP(item.precio_venta)}</span>
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {cotId && items.length > 0 && seleccionados.size > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0 space-y-2">
            {tieneExterno && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Método de pago a proveedores (ítems Externos) <span className="text-red-500">*</span>
                </label>
                <select value={metodoPagoExterno} onChange={e => { setMetodoPagoExterno(e.target.value); setErrorMetodo('') }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                  <option value="">Selecciona un método...</option>
                  {metodosPago.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
                {errorMetodo && <p className="text-xs text-red-600 mt-1">{errorMetodo}</p>}
              </div>
            )}
            <button
              onClick={importar}
              disabled={importando}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors"
            >
              {importando
                ? 'Importando...'
                : `Importar ${seleccionados.size} ítem${seleccionados.size !== 1 ? 's' : ''} a la orden`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
