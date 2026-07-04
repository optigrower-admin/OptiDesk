'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'

type UmaItem = { id: string; codigo: string; descripcion: string; subgrupo: string | null; precio_publico_iva: number }
type ClienteSugerido = { id: string; nombre: string | null; celular: string | null }
type Item = {
  _key: string
  tipo: 'repuesto_uma' | 'repuesto_externo' | 'mano_obra'
  uma_id?: string
  referencia: string
  descripcion: string
  cantidad: number
  precio_proveedor: number | null
  precio_venta: number
  precio_catalogo?: number  // para validación UMA
}

function cop(n: number) {
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

let keyCounter = 0
function nextKey() { return String(++keyCounter) }

type TipoAdd = 'repuesto_uma' | 'repuesto_externo' | 'mano_obra'

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

  /* ── Tipo de ítem a agregar ── */
  const [tipoAdd, setTipoAdd]           = useState<TipoAdd>('repuesto_uma')

  /* ── Búsqueda UMA ── */
  const [umaBusq, setUmaBusq]           = useState('')
  const [umaResultados, setUmaResultados] = useState<UmaItem[]>([])
  const [umaCargando, setUmaCargando]   = useState(false)
  const [umaSeleccionada, setUmaSeleccionada] = useState<UmaItem | null>(null)
  const [umaPrecioVenta, setUmaPrecioVenta]   = useState('')
  const [umaCantidad, setUmaCantidad]         = useState('1')

  /* ── Repuesto externo ── */
  const [extDescripcion, setExtDescripcion]   = useState('')
  const [extCostoProv, setExtCostoProv]       = useState('')
  const [extPrecioVenta, setExtPrecioVenta]   = useState('')
  const [extCantidad, setExtCantidad]         = useState('1')

  /* ── Mano de obra ── */
  const [moDescripcion, setMoDescripcion]     = useState('')
  const [moPrecio, setMoPrecio]               = useState('')
  const [moCantidad, setMoCantidad]           = useState('1')

  /* ── Lista de items ── */
  const [items, setItems] = useState<Item[]>([])

  /* ── Opciones finales ── */
  const [notas, setNotas]       = useState('')
  const [vigencia, setVigencia] = useState(30)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const busqRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Búsqueda de clientes existentes ── */
  useEffect(() => {
    if (clienteBusq.trim().length < 2 || !profile?.tenant_id) { setClientesSug([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('clientes')
        .select('id, nombre, celular')
        .eq('tenant_id', profile.tenant_id)
        .ilike('nombre', `%${clienteBusq}%`)
        .limit(6)
      setClientesSug((data ?? []) as ClienteSugerido[])
    }, 300)
    return () => clearTimeout(t)
  }, [clienteBusq, profile?.tenant_id])

  function seleccionarCliente(c: ClienteSugerido) {
    setClienteId(c.id)
    setCliNombre(c.nombre ?? '')
    setCliCelular(c.celular ?? '')
    setClienteBusq('')
    setClientesSug([])
  }

  function limpiarCliente() {
    setClienteId(null); setCliNombre(''); setCliCelular(''); setCliEmail('')
  }

  /* ── Búsqueda UMA ── */
  function buscarUma(q: string) {
    setUmaBusq(q)
    if (busqRef.current) clearTimeout(busqRef.current)
    if (q.trim().length < 2 || !profile?.tenant_id) { setUmaResultados([]); return }
    setUmaCargando(true)
    busqRef.current = setTimeout(async () => {
      const { data } = await supabase.from('repuestos_uma')
        .select('id, codigo, descripcion, subgrupo, precio_publico_iva')
        .eq('tenant_id', profile.tenant_id)
        .or(`codigo.ilike.%${q}%,descripcion.ilike.%${q}%,subgrupo.ilike.%${q}%`)
        .limit(20)
      setUmaResultados((data ?? []) as UmaItem[])
      setUmaCargando(false)
    }, 300)
  }

  function seleccionarUma(item: UmaItem) {
    setUmaSeleccionada(item)
    setUmaPrecioVenta(String(item.precio_publico_iva))
    setUmaBusq('')
    setUmaResultados([])
  }

  /* ── Agregar items ── */
  function agregarUma() {
    if (!umaSeleccionada) return
    const pv = parseFloat(umaPrecioVenta)
    if (isNaN(pv) || pv < umaSeleccionada.precio_publico_iva) {
      setError(`El precio de venta no puede ser menor al precio de catálogo (${cop(umaSeleccionada.precio_publico_iva)})`)
      return
    }
    setError('')
    setItems(p => [...p, {
      _key: nextKey(),
      tipo: 'repuesto_uma',
      uma_id: umaSeleccionada.id,
      referencia: umaSeleccionada.codigo,
      descripcion: umaSeleccionada.descripcion,
      cantidad: Math.max(1, parseInt(umaCantidad) || 1),
      precio_proveedor: umaSeleccionada.precio_publico_iva,
      precio_venta: pv,
      precio_catalogo: umaSeleccionada.precio_publico_iva,
    }])
    setUmaSeleccionada(null); setUmaPrecioVenta(''); setUmaCantidad('1')
  }

  function agregarExterno() {
    if (!extDescripcion.trim() || !extPrecioVenta) return
    setItems(p => [...p, {
      _key: nextKey(),
      tipo: 'repuesto_externo',
      referencia: '',
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
      _key: nextKey(),
      tipo: 'mano_obra',
      referencia: '',
      descripcion: moDescripcion.trim(),
      cantidad: Math.max(1, parseInt(moCantidad) || 1),
      precio_proveedor: null,
      precio_venta: parseFloat(moPrecio),
    }])
    setMoDescripcion(''); setMoPrecio(''); setMoCantidad('1')
  }

  function eliminarItem(key: string) {
    setItems(p => p.filter(i => i._key !== key))
  }

  const totalVenta     = items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalProveedor = items.reduce((s, i) => s + (i.precio_proveedor ?? 0) * i.cantidad, 0)

  async function generar() {
    if (items.length === 0) { setError('Agrega al menos un ítem'); return }
    if (!cliNombre.trim()) { setError('Ingresa el nombre del cliente'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/cotizaciones-servtec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id:      clienteId,
          cliente_nombre:  cliNombre,
          cliente_celular: cliCelular || null,
          cliente_email:   cliEmail || null,
          notas:           notas || null,
          vigencia_dias:   vigencia,
          items: items.map(({ _key, precio_catalogo, ...rest }) => rest),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al crear')
      router.push(`/admin/cotizaciones-servtec/${json.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al generar la cotización')
      setSaving(false)
    }
  }

  const TIPO_LABEL: Record<TipoAdd, string> = {
    repuesto_uma:      'Repuesto UMA',
    repuesto_externo:  'Repuesto externo',
    mano_obra:         'Mano de obra',
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

      {/* ── CLIENTE ── */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cliente</p>

        {/* Buscar existente */}
        {!clienteId && (
          <div className="relative mb-3">
            <input value={clienteBusq} onChange={e => setClienteBusq(e.target.value)}
              placeholder="Buscar cliente existente por nombre..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {clientesSug.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                {clientesSug.map(c => (
                  <button key={c.id} onClick={() => seleccionarCliente(c)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0">
                    <p className="text-sm font-medium text-gray-900">{c.nombre ?? 'Sin nombre'}</p>
                    {c.celular && <p className="text-xs text-gray-400">{c.celular}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {clienteId && (
          <div className="flex items-center gap-2 mb-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <span className="text-xs text-blue-700 font-semibold flex-1">✓ Cliente vinculado: {cliNombre}</span>
            <button onClick={limpiarCliente} className="text-xs text-blue-500 hover:text-blue-700">Cambiar</button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          <input value={cliNombre} onChange={e => setCliNombre(e.target.value)} placeholder="Nombre completo *"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="grid grid-cols-2 gap-2">
            <input value={cliCelular} onChange={e => setCliCelular(e.target.value)} placeholder="Celular"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input value={cliEmail} onChange={e => setCliEmail(e.target.value)} placeholder="Correo (opcional)" type="email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </section>

      {/* ── AGREGAR ÍTEMS ── */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Agregar ítems</p>

        {/* Selector de tipo */}
        <div className="flex gap-1.5 mb-4 bg-gray-100 rounded-xl p-1">
          {(['repuesto_uma', 'repuesto_externo', 'mano_obra'] as TipoAdd[]).map(t => (
            <button key={t} onClick={() => setTipoAdd(t)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors ${
                tipoAdd === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              {TIPO_LABEL[t]}
            </button>
          ))}
        </div>

        {/* REPUESTO UMA */}
        {tipoAdd === 'repuesto_uma' && (
          <div className="space-y-2">
            {!umaSeleccionada ? (
              <div className="relative">
                <input value={umaBusq} onChange={e => buscarUma(e.target.value)}
                  placeholder="Buscar por # referencia, sub-tipo o descripción..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {umaCargando && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
                {umaResultados.length > 0 && (
                  <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {umaResultados.map(u => (
                      <button key={u.id} onClick={() => seleccionarUma(u)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-mono text-blue-700">{u.codigo}</p>
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
                    <p className="text-xs font-mono text-blue-700">{umaSeleccionada.codigo}</p>
                    <p className="text-sm font-semibold text-gray-900">{umaSeleccionada.descripcion}</p>
                    <p className="text-xs text-gray-500">Precio catálogo: {cop(umaSeleccionada.precio_publico_iva)}</p>
                  </div>
                  <button onClick={() => { setUmaSeleccionada(null); setUmaPrecioVenta('') }}
                    className="text-gray-400 hover:text-gray-700 text-sm">✕</button>
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
                  + Agregar repuesto UMA
                </button>
              </div>
            )}
          </div>
        )}

        {/* REPUESTO EXTERNO */}
        {tipoAdd === 'repuesto_externo' && (
          <div className="space-y-2">
            <input value={extDescripcion} onChange={e => setExtDescripcion(e.target.value)}
              placeholder="Descripción del repuesto *"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500">Costo proveedor (COP)</label>
                <input type="number" value={extCostoProv} onChange={e => setExtCostoProv(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Precio venta c/IVA *</label>
                <input type="number" value={extPrecioVenta} onChange={e => setExtPrecioVenta(e.target.value)}
                  placeholder="0"
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
            <input value={moDescripcion} onChange={e => setMoDescripcion(e.target.value)}
              placeholder="Descripción del servicio *"
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

      {/* ── LISTA DE ÍTEMS ── */}
      {items.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Ítems agregados <span className="ml-1 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full text-[10px]">{items.length}</span>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-semibold">Tipo</th>
                  <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-semibold">Ref.</th>
                  <th className="text-left px-2 py-1.5 text-xs text-gray-500 font-semibold">Descripción</th>
                  <th className="text-center px-2 py-1.5 text-xs text-gray-500 font-semibold">Cant.</th>
                  <th className="text-right px-2 py-1.5 text-xs text-gray-500 font-semibold">P. Prov.</th>
                  <th className="text-right px-2 py-1.5 text-xs text-gray-500 font-semibold">P. Venta</th>
                  <th className="text-right px-2 py-1.5 text-xs text-gray-500 font-semibold">Total</th>
                  <th className="px-2 py-1.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item._key} className={`border-t border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                    <td className="px-2 py-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                        item.tipo === 'repuesto_uma' ? 'bg-blue-100 text-blue-700' :
                        item.tipo === 'repuesto_externo' ? 'bg-amber-100 text-amber-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {item.tipo === 'repuesto_uma' ? 'UMA' : item.tipo === 'repuesto_externo' ? 'Ext.' : 'M.O.'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-gray-500">{item.referencia || '—'}</td>
                    <td className="px-2 py-1.5 text-gray-800 max-w-[160px] truncate">{item.descripcion}</td>
                    <td className="px-2 py-1.5 text-center text-gray-700 font-medium">{item.cantidad}</td>
                    <td className="px-2 py-1.5 text-right text-gray-400 text-xs">{item.precio_proveedor ? cop(item.precio_proveedor) : '—'}</td>
                    <td className="px-2 py-1.5 text-right text-gray-700">{cop(item.precio_venta)}</td>
                    <td className="px-2 py-1.5 text-right font-bold text-emerald-700">{cop(item.precio_venta * item.cantidad)}</td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => eliminarItem(item._key)} className="text-red-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="mt-3 flex flex-col items-end gap-1 border-t border-gray-100 pt-3">
            {totalProveedor > 0 && (
              <p className="text-xs text-gray-400">Total proveedor: <span className="font-semibold text-gray-600">{cop(totalProveedor)}</span></p>
            )}
            <p className="text-base font-bold text-gray-900">Total venta: <span className="text-emerald-700">{cop(totalVenta)}</span></p>
          </div>
        </section>
      )}

      {/* ── OPCIONES ── */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Vigencia (días)</label>
            <input type="number" min={1} max={365} value={vigencia} onChange={e => setVigencia(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500 block mb-1">Notas adicionales (opcional)</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
      </section>

      <button onClick={generar} disabled={saving || items.length === 0}
        className="w-full py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
        {saving
          ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Generando...</>
          : '📄 Generar cotización'
        }
      </button>
    </div>
  )
}
