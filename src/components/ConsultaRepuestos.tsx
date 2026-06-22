'use client'
import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { formatCOP } from '@/lib/utils'

/* ─── Tipos ─────────────────────────────────────── */
interface RepuestoUMA {
  id: string
  codigo: string
  descripcion: string
  subgrupo: string | null
  unidad_empaque: number
  precio_publico_iva: number
}

interface Proveedor {
  id: string
  nombre: string
  telefono: string | null
  ubicacion: string | null
}

interface RepuestoExterno {
  id: string
  codigo: string | null
  nombre: string
  subgrupo: string | null
  unidad_empaque: number
  ultimo_costo: number | null
  ultimo_precio_venta: number | null
  proveedores: Proveedor | null
}

interface ItemOrden {
  descripcion: string
  origen: 'uma' | 'externo' | 'insumo'
  repuesto_uma_id?: string
  repuesto_externo_id?: string
  cantidad: number
  costo: number
  precio_venta: number
  metodo_pago_id?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string
  onAdd: (item: ItemOrden) => void
  permitirInsumos?: boolean
}

/* ─── Helpers ────────────────────────────────────── */
function soloDigitos(v: string) { return v.replace(/\D/g, '') }
function formatTel(d: string) {
  const n = soloDigitos(d).slice(0, 10)
  if (n.length <= 3) return n
  if (n.length <= 6) return `(${n.slice(0, 3)}) ${n.slice(3)}`
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
}
function fmtCOP(raw: string) {
  const n = parseInt(raw.replace(/\D/g, '') || '0', 10)
  return n ? n.toLocaleString('es-CO') : ''
}

/* ─── Componente ─────────────────────────────────── */
export function ConsultaRepuestos({ open, onClose, tenantId, onAdd, permitirInsumos = false }: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState<'uma' | 'externo' | 'insumo' | 'porta_placas'>('uma')

  /* ══ MÉTODOS DE PAGO (para registrar con qué se paga al proveedor) ══ */
  const [metodosPago, setMetodosPago] = useState<{ id: string; nombre: string }[]>([])

  /* ══ INSUMOS ═══════════════════════════════════════ */
  const [insumoValor, setInsumoValor] = useState('10000')

  /* ══ PORTA PLACAS ═══════════════════════════════════ */
  const [portaPlacasValor, setPortaPlacasValor] = useState('25000')

  /* ══ UMA ══════════════════════════════════════════ */
  const [umaFuente, setUmaFuente] = useState<'repuesto' | 'lubricante'>('repuesto')
  const [umaRef, setUmaRef] = useState('')
  const [umaSub, setUmaSub] = useState('')
  const [umaDesc, setUmaDesc] = useState('')
  const [umaRows, setUmaRows] = useState<RepuestoUMA[]>([])
  const [umaLoading, setUmaLoading] = useState(false)
  const [umaBuscado, setUmaBuscado] = useState(false)
  const [umaTruncado, setUmaTruncado] = useState(false)
  // Seleccionado para editar precio
  const [umaSelId, setUmaSelId] = useState<string | null>(null)
  const [umaPrecio, setUmaPrecio] = useState('')
  const [umaCant, setUmaCant] = useState(1)
  const [umaErrPrecio, setUmaErrPrecio] = useState('')

  /* ══ EXTERNO ═══════════════════════════════════════ */
  // Formulario nuevo externo (única vista de esta pestaña — sin buscador)
  const [fProv, setFProv] = useState('')
  const [fTel, setFTel] = useState('')
  const [fUbic, setFUbic] = useState('')
  const [fSub, setFSub] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fUnidad, setFUnidad] = useState('1')
  const [fCosto, setFCosto] = useState('')
  const [fPrecio, setFPrecio] = useState('')
  const [fCantidad, setFCantidad] = useState(1)
  const [fSaving, setFSaving] = useState(false)
  const [fError, setFError] = useState('')
  const [fSinDatos, setFSinDatos] = useState(true)
  const [fMetodoPago, setFMetodoPago] = useState('')
  const [confirmPrecioBajo, setConfirmPrecioBajo] = useState(false)
  // Autocomplete proveedor
  const [provSugg, setProvSugg] = useState<Proveedor[]>([])
  const [showProvDrop, setShowProvDrop] = useState(false)
  const [provExistente, setProvExistente] = useState<Proveedor | null>(null)
  const provDebRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Reset al abrir ── */
  useEffect(() => {
    if (open) {
      setUmaSelId(null); setUmaErrPrecio(''); setUmaFuente('repuesto')
      setFError(''); setFSinDatos(true); setFCantidad(1); setFMetodoPago('')
      setConfirmPrecioBajo(false)
      setInsumoValor('10000')
      setPortaPlacasValor('25000')
    }
  }, [open])

  /* ── Cargar métodos de pago (para registrar costo proveedor / cobro) ── */
  useEffect(() => {
    if (!open) return
    supabase.from('metodos_pago').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true).order('nombre')
      .then(({ data }) => setMetodosPago((data as { id: string; nombre: string }[]) ?? []))
  }, [open, supabase, tenantId])

  /* ══ Búsqueda UMA (manual) ══════════════════════════ */
  const buscarUMA = useCallback(async () => {
    setUmaLoading(true); setUmaBuscado(true)
    try {
      let q = supabase
        .from('repuestos_uma')
        .select('id, codigo, descripcion, subgrupo, unidad_empaque, precio_publico_iva')
        .eq('tenant_id', tenantId).eq('activo', true).eq('tipo', umaFuente)
      if (umaRef) q = q.ilike('codigo', `%${umaRef}%`)
      if (umaSub) q = q.ilike('subgrupo', `%${umaSub}%`)
      if (umaDesc) q = q.ilike('descripcion', `%${umaDesc}%`)
      const { data } = await q.order('descripcion').limit(501)
      const rows = (data as RepuestoUMA[]) ?? []
      setUmaTruncado(rows.length > 500)
      setUmaRows(rows.slice(0, 500))
    } finally { setUmaLoading(false) }
  }, [supabase, tenantId, umaFuente, umaRef, umaSub, umaDesc])

  /* ── Autocomplete proveedor ── */
  const buscarProveedores = useCallback(async (q: string) => {
    if (q.length < 2) { setProvSugg([]); return }
    const { data } = await supabase
      .from('proveedores')
      .select('id, nombre, telefono, ubicacion')
      .eq('tenant_id', tenantId)
      .ilike('nombre', `%${q}%`)
      .limit(8)
    setProvSugg((data as Proveedor[]) ?? [])
    setShowProvDrop(true)
  }, [supabase, tenantId])

  const onProvChange = (v: string) => {
    setFProv(v); setProvExistente(null)
    if (provDebRef.current) clearTimeout(provDebRef.current)
    provDebRef.current = setTimeout(() => buscarProveedores(v), 250)
  }

  const seleccionarProv = (p: Proveedor) => {
    setFProv(p.nombre)
    setFTel(soloDigitos(p.telefono ?? ''))
    setFUbic(p.ubicacion ?? '')
    setProvExistente(p)
    setProvSugg([]); setShowProvDrop(false)
  }

  /* ── Seleccionar UMA para agregar ── */
  const selUMA = (r: RepuestoUMA) => {
    setUmaSelId(r.id)
    setUmaPrecio(String(Math.round(r.precio_publico_iva ?? 0)))
    setUmaCant(1); setUmaErrPrecio('')
  }

  const confirmarUMA = () => {
    const sel = umaRows.find((r) => r.id === umaSelId)
    if (!sel) return
    const pVal = parseInt(umaPrecio.replace(/\D/g, ''), 10)
    const pMin = sel.precio_publico_iva ?? 0
    if (isNaN(pVal) || pVal < pMin) {
      setUmaErrPrecio(`Mínimo: ${formatCOP(pMin)}`); return
    }
    onAdd({
      descripcion: `${sel.codigo} - ${sel.descripcion}`,
      origen: 'uma',
      repuesto_uma_id: sel.id,
      cantidad: umaCant,
      costo: 0,
      precio_venta: pVal,
    })
    setUmaSelId(null); onClose()
  }

  /* ── Agregar insumo (valor rápido, sin proveedor ni costo) ── */
  const confirmarInsumo = () => {
    const valor = parseInt(insumoValor.replace(/\D/g, ''), 10) || 0
    if (!valor) return
    onAdd({
      descripcion: 'Insumos',
      origen: 'insumo',
      cantidad: 1,
      costo: 0,
      precio_venta: valor,
      metodo_pago_id: null,
    })
    onClose()
  }

  /* ── Agregar porta placas (valor rápido, sin proveedor ni costo) ── */
  const confirmarPortaPlacas = () => {
    const valor = parseInt(portaPlacasValor.replace(/\D/g, ''), 10) || 0
    if (!valor) return
    onAdd({
      descripcion: 'Porta Placas',
      origen: 'insumo',
      cantidad: 1,
      costo: 0,
      precio_venta: valor,
      metodo_pago_id: null,
    })
    onClose()
  }

  /* ── Guardar nuevo externo ── */
  const guardarNuevoExt = async (forzado = false) => {
    if (!fDesc.trim()) { setFError('La descripción es obligatoria'); return }
    if (fPrecio.trim() === '') { setFError('Ingresa un precio de venta válido'); return }
    if (!fMetodoPago) { setFError('Selecciona con qué método se paga al proveedor'); return }
    const precio = parseInt(fPrecio.replace(/\D/g, ''), 10) || 0
    const costo = parseInt(fCosto.replace(/\D/g, ''), 10) || 0

    if (!forzado && costo > 0 && precio < costo) {
      setConfirmPrecioBajo(true)
      return
    }
    setConfirmPrecioBajo(false)

    // Sin proveedor: no se guarda nada en el catálogo de Externos/Propios
    // (ni proveedores ni repuestos_externos) — se agrega directo a esta orden.
    if (fSinDatos) {
      onAdd({
        descripcion: fDesc.trim(),
        origen: 'externo',
        cantidad: fCantidad,
        costo,
        precio_venta: precio,
        metodo_pago_id: fMetodoPago,
      })
      setFProv(''); setFTel(''); setFUbic(''); setFSub('')
      setFDesc(''); setFUnidad('1'); setFCosto(''); setFPrecio(''); setFCantidad(1)
      setProvExistente(null); setFSinDatos(true); setFMetodoPago('')
      onClose()
      return
    }

    setFSaving(true); setFError('')
    try {
      let proveedorId: string | null = null

      if (fProv.trim()) {
        if (provExistente) {
          proveedorId = provExistente.id
          if (fTel || fUbic) {
            await supabase.from('proveedores').update({
              telefono: fTel ? formatTel(fTel) : provExistente.telefono,
              ubicacion: fUbic || provExistente.ubicacion,
            }).eq('id', provExistente.id)
          }
        } else {
          const { data: np, error: eP } = await supabase.from('proveedores').insert({
            tenant_id: tenantId,
            nombre: fProv.trim(),
            telefono: fTel ? formatTel(fTel) : null,
            ubicacion: fUbic.trim() || null,
          }).select('id').single()
          if (eP) { setFError(`Error al crear proveedor: ${eP.message}`); return }
          proveedorId = (np as { id: string } | null)?.id ?? null
        }
      }

      const { data: nr, error: eR } = await supabase.from('repuestos_externos').insert({
        tenant_id: tenantId,
        nombre: fDesc.trim(),
        subgrupo: fSub.trim() || null,
        unidad_empaque: parseInt(fUnidad) || 1,
        ultimo_costo: costo,
        ultimo_precio_venta: precio,
        proveedor_id: proveedorId,
      }).select('id, codigo, nombre, subgrupo, unidad_empaque, ultimo_costo, ultimo_precio_venta, proveedores(id, nombre, telefono, ubicacion)').single()

      if (eR) { setFError(`Error: ${eR.message}`); return }

      if (nr) {
        const newRow = nr as unknown as RepuestoExterno
        // Queda guardado en el catálogo de Externos/Propios para reutilizarlo después,
        // y además se agrega de una vez a esta orden.
        onAdd({
          descripcion: newRow.nombre,
          origen: 'externo',
          repuesto_externo_id: newRow.id,
          cantidad: fCantidad,
          costo,
          precio_venta: precio,
          metodo_pago_id: fMetodoPago,
        })
        setFProv(''); setFTel(''); setFUbic(''); setFSub('')
        setFDesc(''); setFUnidad('1'); setFCosto(''); setFPrecio(''); setFCantidad(1); setFMetodoPago('')
        setProvExistente(null); setFSinDatos(true)
        onClose()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setFError(`Error al guardar: ${msg}`)
    } finally { setFSaving(false) }
  }

  /* ══ Render ════════════════════════════════════════ */
  const umaSelected = umaRows.find((r) => r.id === umaSelId) ?? null

  return (
    <Modal open={open} onClose={onClose} title="Agregar repuesto" size="full">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-lg w-fit">
        {(permitirInsumos ? (['uma', 'externo', 'insumo', 'porta_placas'] as const) : (['uma', 'externo'] as const)).map((t) => (
          <button key={t} onClick={() => { setTab(t); setUmaSelId(null) }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {t === 'uma' ? 'Repuestos UMA' : t === 'externo' ? 'Externos / Propios' : t === 'insumo' ? 'Insumos' : 'Porta Placas'}
          </button>
        ))}
      </div>

      {/* ════════════════════ TAB UMA ════════════════════ */}
      {tab === 'uma' && (
        <div className="space-y-3">

          {/* Toggle Repuestos / Lubricantes */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
            {(['repuesto', 'lubricante'] as const).map((f) => (
              <button key={f}
                onClick={() => { setUmaFuente(f); setUmaSelId(null); setUmaRows([]); setUmaBuscado(false) }}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  umaFuente === f ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}>
                {f === 'repuesto' ? 'Repuestos' : 'Lubricantes'}
              </button>
            ))}
          </div>

          {/* Filtros + botón buscar */}
          <div className="flex gap-2 flex-wrap items-center">
            <input value={umaRef} onChange={(e) => setUmaRef(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarUMA()}
              placeholder="# Referencia"
              className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <input value={umaSub} onChange={(e) => setUmaSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarUMA()}
              placeholder="Sub-Grupo"
              className="w-44 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <input value={umaDesc} onChange={(e) => setUmaDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarUMA()}
              placeholder="Descripción..."
              className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus />
            <button onClick={buscarUMA} disabled={umaLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-300 text-white rounded-lg text-sm font-semibold transition-colors">
              {umaLoading
                ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              }
              Buscar
            </button>
            {(umaRef || umaSub || umaDesc) && (
              <button onClick={() => { setUmaRef(''); setUmaSub(''); setUmaDesc(''); setUmaSelId(null) }}
                className="text-xs text-gray-400 hover:text-red-500 px-2">Limpiar</button>
            )}
          </div>

          {/* Estado */}
          {!umaBuscado
            ? <p className="text-xs text-gray-400 py-2">Ingresa filtros y presiona Buscar para ver repuestos</p>
            : <p className="text-xs text-gray-400">{umaRows.length} repuesto{umaRows.length !== 1 ? 's' : ''}{umaTruncado ? ' (mostrando primeros 500 — refina los filtros)' : ''}</p>
          }

          {/* Tabla */}
          {umaBuscado && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-y-auto" style={{ maxHeight: '340px' }}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-blue-600 text-white">
                      <th className="text-left py-2.5 px-3 font-semibold text-xs whitespace-nowrap"># Ref.</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-xs">Sub-Grupo</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-xs">Descripción</th>
                      <th className="text-center py-2.5 px-3 font-semibold text-xs">U.Emp</th>
                      <th className="text-right py-2.5 px-3 font-semibold text-xs whitespace-nowrap">Precio c/IVA</th>
                      <th className="py-2.5 px-3 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {umaRows.map((r) => {
                      const isSel = r.id === umaSelId
                      return (
                        <Fragment key={r.id}>
                          <tr
                            className={`border-t border-gray-100 transition-colors ${isSel ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                            <td className="py-2.5 px-3 font-mono text-gray-500 text-xs whitespace-nowrap">{r.codigo}</td>
                            <td className="py-2.5 px-3 text-gray-500 text-xs max-w-[120px] truncate">{r.subgrupo ?? '—'}</td>
                            <td className="py-2.5 px-3 text-gray-900 max-w-[240px]">{r.descripcion}</td>
                            <td className="py-2.5 px-3 text-center text-gray-500">{r.unidad_empaque ?? 1}</td>
                            <td className="py-2.5 px-3 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCOP(r.precio_publico_iva)}</td>
                            <td className="py-2.5 px-3 text-right">
                              {isSel
                                ? <button onClick={() => setUmaSelId(null)}
                                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">✕</button>
                                : <button onClick={() => selUMA(r)}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                                    + Agregar
                                  </button>
                              }
                            </td>
                          </tr>
                          {/* Fila expandida para editar precio */}
                          {isSel && (
                            <tr className="bg-blue-50 border-t border-blue-200">
                              <td colSpan={6} className="px-4 py-3">
                                <div className="flex gap-3 items-end flex-wrap">
                                  <div>
                                    <label className="text-xs text-gray-600 block mb-1">
                                      Precio al cliente <span className="text-gray-400">(mín. {formatCOP(r.precio_publico_iva)})</span>
                                    </label>
                                    <div className={`flex items-center border rounded-lg overflow-hidden bg-white ${umaErrPrecio ? 'border-red-400' : 'border-gray-300 focus-within:ring-2 focus-within:ring-blue-400'}`}>
                                      <span className="px-2 text-gray-400 text-sm border-r border-gray-200 py-1.5">$</span>
                                      <input type="text" inputMode="numeric"
                                        value={fmtCOP(umaPrecio)}
                                        onChange={(e) => { setUmaPrecio(e.target.value.replace(/\D/g, '')); setUmaErrPrecio('') }}
                                        className="w-28 px-2 py-1.5 text-sm font-mono text-right focus:outline-none" />
                                    </div>
                                    {umaErrPrecio && <p className="text-xs text-red-500 mt-0.5">{umaErrPrecio}</p>}
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-600 block mb-1">Cantidad</label>
                                    <input type="number" min={1} value={umaCant}
                                      onChange={(e) => setUmaCant(Math.max(1, parseInt(e.target.value) || 1))}
                                      className="w-18 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none" />
                                  </div>
                                  {umaPrecio && (
                                    <p className="text-sm text-gray-600">
                                      Total: <span className="font-semibold">{formatCOP(parseInt(umaPrecio.replace(/\D/g, '') || '0', 10) * umaCant)}</span>
                                    </p>
                                  )}
                                  <button onClick={confirmarUMA}
                                    className="ml-auto px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                                    ✓ Confirmar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                    {!umaLoading && umaRows.length === 0 && (
                      <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">
                        Sin resultados — ajusta los filtros y busca de nuevo
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ TAB EXTERNO ════════════════════ */}
      {tab === 'externo' && (
        <div className="space-y-3">

          {/* ── Formulario nuevo externo (única vista, sin buscador) ── */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">Nuevo repuesto externo</h3>

              {/* Con proveedor / Sin proveedor */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
                <button type="button" onClick={() => setFSinDatos(false)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    !fSinDatos ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}>
                  Con proveedor
                </button>
                <button type="button" onClick={() => setFSinDatos(true)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    fSinDatos ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}>
                  Sin proveedor
                </button>
              </div>

              {fSinDatos ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Se agrega directo a esta orden con descripción, costo y precio — no queda guardado en el catálogo de Externos/Propios.
                </p>
              ) : (
                <p className="text-xs text-gray-400">
                  Se guarda en el catálogo de Externos/Propios para reutilizarlo después.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Proveedor con autocomplete — oculto en modo Sin datos */}
                {!fSinDatos && (
                  <div className="relative sm:col-span-2">
                    <label className="text-xs font-medium text-gray-700 block mb-1">Proveedor</label>
                    <input value={fProv} onChange={(e) => onProvChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowProvDrop(false), 150)}
                      onFocus={() => fProv.length >= 2 && setShowProvDrop(true)}
                      placeholder="Nombre del proveedor (opcional)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    {showProvDrop && provSugg.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {provSugg.map((p) => (
                          <button key={p.id} onMouseDown={() => seleccionarProv(p)}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0">
                            <span className="font-medium text-gray-900">{p.nombre}</span>
                            {p.telefono && <span className="text-xs text-gray-400 ml-2">{p.telefono}</span>}
                            {p.ubicacion && <span className="text-xs text-gray-400 ml-1">· {p.ubicacion}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {provExistente && (
                      <p className="text-xs text-green-600 mt-1">✓ Proveedor existente — datos auto-completados</p>
                    )}
                  </div>
                )}

                {/* Teléfono — oculto en modo Sin datos */}
                {!fSinDatos && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Teléfono proveedor</label>
                    <input value={formatTel(fTel)} onChange={(e) => setFTel(soloDigitos(e.target.value))}
                      placeholder="(310) 000-0000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>
                )}

                {/* Ubicación — oculta en modo Sin datos */}
                {!fSinDatos && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Ubicación</label>
                    <input value={fUbic} onChange={(e) => setFUbic(e.target.value)}
                      placeholder="Ciudad / Dirección"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>
                )}

                {/* Sub-grupo — oculto en modo Sin datos */}
                {!fSinDatos && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Sub-tipo de repuesto</label>
                    <input value={fSub} onChange={(e) => setFSub(e.target.value)}
                      placeholder="Ej: Frenos, Motor, Eléctrico..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>
                )}

                {/* Unidad empaque — oculta en modo Sin datos */}
                {!fSinDatos && (
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Unidad empaque</label>
                    <input type="number" min={1} value={fUnidad} onChange={(e) => setFUnidad(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>
                )}

                {/* Descripción (siempre visible) */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Nombre / Descripción <span className="text-red-400">*</span>
                  </label>
                  <input value={fDesc} onChange={(e) => setFDesc(e.target.value)}
                    placeholder="Nombre / descripción del repuesto"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>

                {/* Costo (siempre visible) */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Costo con proveedor</label>
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-green-400 bg-white">
                    <span className="px-2 text-gray-400 text-sm border-r border-gray-200 py-2">$</span>
                    <input type="text" inputMode="numeric"
                      value={fmtCOP(fCosto)} onChange={(e) => setFCosto(e.target.value.replace(/\D/g, ''))}
                      placeholder="0"
                      className="flex-1 px-2 py-2 text-sm font-mono text-right focus:outline-none" />
                  </div>
                </div>

                {/* Precio venta (siempre visible) */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Precio de venta <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-green-400 bg-white">
                    <span className="px-2 text-gray-400 text-sm border-r border-gray-200 py-2">$</span>
                    <input type="text" inputMode="numeric"
                      value={fmtCOP(fPrecio)} onChange={(e) => setFPrecio(e.target.value.replace(/\D/g, ''))}
                      placeholder="0"
                      className="flex-1 px-2 py-2 text-sm font-mono text-right focus:outline-none" />
                  </div>
                </div>

                {/* Cantidad (siempre visible) */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Cantidad</label>
                  <input type="number" min={1} value={fCantidad}
                    onChange={(e) => setFCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>

                {/* Método de pago al proveedor (siempre visible) */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Método de pago al proveedor <span className="text-red-400">*</span>
                  </label>
                  <select value={fMetodoPago} onChange={(e) => setFMetodoPago(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                    <option value="">Selecciona...</option>
                    {metodosPago.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </div>
              </div>

              {fError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{fError}</p>
              )}

              <div className="flex gap-2 justify-end">
                <button onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Cancelar
                </button>
                <button onClick={() => guardarNuevoExt()} disabled={fSaving || !fMetodoPago}
                  className={`px-5 py-2 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
                    fSinDatos ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300' : 'bg-green-600 hover:bg-green-700 disabled:bg-green-300'
                  }`}>
                  {fSaving && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  {fSinDatos ? 'Agregar a la orden' : 'Guardar y agregar a la orden'}
                </button>
              </div>
          </div>
        </div>
      )}

      {/* ════════════════════ TAB INSUMOS ════════════════════ */}
      {tab === 'insumo' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-4 max-w-sm">
          <div>
            <h3 className="font-semibold text-purple-900">Agregar insumos</h3>
            <p className="text-xs text-purple-600 mt-1">
              Valor rápido sin proveedor — cuenta como ingreso en Caja, no genera gasto.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-purple-700 block mb-1">Valor</label>
            <div className="flex items-center border border-purple-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-purple-400 bg-white">
              <span className="px-2 text-gray-400 text-sm border-r border-gray-200 py-2">$</span>
              <input type="text" inputMode="numeric" autoFocus
                value={fmtCOP(insumoValor)} onChange={(e) => setInsumoValor(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="flex-1 px-2 py-2 text-sm font-mono text-right focus:outline-none" />
            </div>
          </div>
          <button onClick={confirmarInsumo} disabled={!parseInt(insumoValor.replace(/\D/g, ''), 10)}
            className="w-full px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg text-sm font-semibold transition-colors">
            + Agregar a la orden
          </button>
        </div>
      )}

      {/* ════════════════════ TAB PORTA PLACAS ════════════════════ */}
      {tab === 'porta_placas' && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-5 space-y-4 max-w-sm">
          <div>
            <h3 className="font-semibold text-teal-900">Agregar Porta Placas</h3>
            <p className="text-xs text-teal-600 mt-1">
              Valor rápido sin proveedor — cuenta como ingreso en Caja, no genera gasto.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-teal-700 block mb-1">Valor</label>
            <div className="flex items-center border border-teal-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-teal-400 bg-white">
              <span className="px-2 text-gray-400 text-sm border-r border-gray-200 py-2">$</span>
              <input type="text" inputMode="numeric" autoFocus
                value={fmtCOP(portaPlacasValor)} onChange={(e) => setPortaPlacasValor(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="flex-1 px-2 py-2 text-sm font-mono text-right focus:outline-none" />
            </div>
          </div>
          <button onClick={confirmarPortaPlacas} disabled={!parseInt(portaPlacasValor.replace(/\D/g, ''), 10)}
            className="w-full px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white rounded-lg text-sm font-semibold transition-colors">
            + Agregar a la orden
          </button>
        </div>
      )}

      {/* Confirmación: precio de venta menor al costo proveedor */}
      {confirmPrecioBajo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="font-bold text-gray-900 mb-2">¿Precio de venta menor al costo?</h3>
            <p className="text-sm text-gray-500 mb-4">
              El precio de venta (<strong>{formatCOP(parseInt(fPrecio.replace(/\D/g, '') || '0', 10))}</strong>) es menor
              al costo con proveedor (<strong>{formatCOP(parseInt(fCosto.replace(/\D/g, '') || '0', 10))}</strong>).
              ¿Estás seguro de continuar así?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmPrecioBajo(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={() => guardarNuevoExt(true)} disabled={fSaving}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50">
                {fSaving ? 'Guardando...' : 'Sí, continuar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </Modal>
  )
}
