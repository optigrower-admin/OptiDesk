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
  origen: 'uma' | 'externo'
  repuesto_uma_id?: string
  repuesto_externo_id?: string
  cantidad: number
  costo: number
  precio_venta: number
}

interface Props {
  open: boolean
  onClose: () => void
  tenantId: string
  onAdd: (item: ItemOrden) => void
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
export function ConsultaRepuestos({ open, onClose, tenantId, onAdd }: Props) {
  const supabase = createClient()
  const [tab, setTab] = useState<'uma' | 'externo'>('uma')

  /* ══ UMA ══════════════════════════════════════════ */
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
  const [extProv, setExtProv] = useState('')
  const [extSub, setExtSub] = useState('')
  const [extDesc, setExtDesc] = useState('')
  const [extRows, setExtRows] = useState<RepuestoExterno[]>([])
  const [extLoading, setExtLoading] = useState(false)
  const [extBuscado, setExtBuscado] = useState(false)
  // Seleccionado para editar cantidad/precio
  const [extSelId, setExtSelId] = useState<string | null>(null)
  const [extCant, setExtCant] = useState(1)
  const [extPrecioSel, setExtPrecioSel] = useState('')
  // Formulario nuevo externo
  const [showForm, setShowForm] = useState(false)
  const [fProv, setFProv] = useState('')
  const [fTel, setFTel] = useState('')
  const [fUbic, setFUbic] = useState('')
  const [fSub, setFSub] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fUnidad, setFUnidad] = useState('1')
  const [fCosto, setFCosto] = useState('')
  const [fPrecio, setFPrecio] = useState('')
  const [fSaving, setFSaving] = useState(false)
  const [fError, setFError] = useState('')
  // Autocomplete proveedor
  const [provSugg, setProvSugg] = useState<Proveedor[]>([])
  const [showProvDrop, setShowProvDrop] = useState(false)
  const [provExistente, setProvExistente] = useState<Proveedor | null>(null)
  const provDebRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Reset al abrir ── */
  useEffect(() => {
    if (open) {
      setUmaSelId(null); setUmaErrPrecio('')
      setExtSelId(null)
      setShowForm(false); setFError('')
    }
  }, [open])

  /* ══ Búsqueda UMA (manual) ══════════════════════════ */
  const buscarUMA = useCallback(async () => {
    setUmaLoading(true); setUmaBuscado(true)
    try {
      let q = supabase
        .from('repuestos_uma')
        .select('id, codigo, descripcion, subgrupo, unidad_empaque, precio_publico_iva')
        .eq('tenant_id', tenantId).eq('activo', true)
      if (umaRef) q = q.ilike('codigo', `%${umaRef}%`)
      if (umaSub) q = q.ilike('subgrupo', `%${umaSub}%`)
      if (umaDesc) q = q.ilike('descripcion', `%${umaDesc}%`)
      const { data } = await q.order('descripcion').limit(501)
      const rows = (data as RepuestoUMA[]) ?? []
      setUmaTruncado(rows.length > 500)
      setUmaRows(rows.slice(0, 500))
    } finally { setUmaLoading(false) }
  }, [supabase, tenantId, umaRef, umaSub, umaDesc])

  /* ══ Búsqueda EXTERNOS (manual) ═════════════════════ */
  const buscarExt = useCallback(async () => {
    setExtLoading(true); setExtBuscado(true)
    try {
      let q = supabase
        .from('repuestos_externos')
        .select('id, codigo, nombre, subgrupo, unidad_empaque, ultimo_costo, ultimo_precio_venta, proveedores(id, nombre, telefono, ubicacion)')
        .eq('tenant_id', tenantId)
      if (extProv) q = q.ilike('proveedores.nombre', `%${extProv}%`)
      if (extSub) q = q.ilike('subgrupo', `%${extSub}%`)
      if (extDesc) q = q.ilike('nombre', `%${extDesc}%`)
      const { data } = await q.order('nombre').limit(200)
      setExtRows((data as unknown as RepuestoExterno[]) ?? [])
    } finally { setExtLoading(false) }
  }, [supabase, tenantId, extProv, extSub, extDesc])

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
    setUmaPrecio(String(r.precio_publico_iva ?? 0))
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

  /* ── Seleccionar externo para editar cantidad/precio ── */
  const selExt = (r: RepuestoExterno) => {
    setExtSelId(r.id)
    setExtCant(1)
    setExtPrecioSel(String(r.ultimo_precio_venta ?? 0))
  }

  const confirmarExt = () => {
    const sel = extRows.find((r) => r.id === extSelId)
    if (!sel) return
    const pVal = parseInt(extPrecioSel.replace(/\D/g, ''), 10) || 0
    onAdd({
      descripcion: sel.nombre,
      origen: 'externo',
      repuesto_externo_id: sel.id,
      cantidad: extCant,
      costo: sel.ultimo_costo ?? 0,
      precio_venta: pVal,
    })
    setExtSelId(null)
    onClose()
  }

  /* ── Guardar nuevo externo ── */
  const guardarNuevoExt = async () => {
    if (!fDesc.trim()) { setFError('La descripción es obligatoria'); return }
    const precio = parseInt(fPrecio.replace(/\D/g, ''), 10)
    const costo = parseInt(fCosto.replace(/\D/g, ''), 10) || 0
    if (!precio) { setFError('Ingresa un precio de venta válido'); return }
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
        setExtRows((prev) => [newRow, ...prev])
        setExtBuscado(true)
        setFProv(''); setFTel(''); setFUbic(''); setFSub('')
        setFDesc(''); setFUnidad('1'); setFCosto(''); setFPrecio('')
        setProvExistente(null); setShowForm(false)
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
        {(['uma', 'externo'] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setUmaSelId(null); setExtSelId(null) }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            {t === 'uma' ? 'Repuestos UMA' : 'Externos / Propios'}
          </button>
        ))}
      </div>

      {/* ════════════════════ TAB UMA ════════════════════ */}
      {tab === 'uma' && (
        <div className="space-y-3">

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

          {/* Filtros + buscar */}
          {!showForm && (
            <>
              <div className="flex gap-2 flex-wrap items-center">
                <input value={extProv} onChange={(e) => setExtProv(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarExt()}
                  placeholder="Proveedor"
                  className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <input value={extSub} onChange={(e) => setExtSub(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarExt()}
                  placeholder="Sub-Grupo"
                  className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <input value={extDesc} onChange={(e) => setExtDesc(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && buscarExt()}
                  placeholder="Descripción..."
                  className="flex-1 min-w-[150px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  autoFocus />
                <button onClick={buscarExt} disabled={extLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-semibold transition-colors">
                  {extLoading
                    ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  }
                  Buscar
                </button>
                <button onClick={() => { setShowForm(true); setFError('') }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar nuevo
                </button>
              </div>

              {/* Resultados externos */}
              {extBuscado && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="overflow-y-auto" style={{ maxHeight: '380px' }}>
                    <table className="w-full text-sm">
                      <thead className="sticky top-0">
                        <tr className="bg-amber-500 text-white">
                          <th className="text-left py-2.5 px-3 font-semibold text-xs">Proveedor</th>
                          <th className="text-left py-2.5 px-3 font-semibold text-xs">Sub-Grupo</th>
                          <th className="text-left py-2.5 px-3 font-semibold text-xs">Descripción</th>
                          <th className="text-center py-2.5 px-3 font-semibold text-xs">U.Emp</th>
                          <th className="text-right py-2.5 px-3 font-semibold text-xs">P. Venta</th>
                          <th className="py-2.5 px-3 w-24" />
                        </tr>
                      </thead>
                      <tbody>
                        {extRows.map((r) => {
                          const isSel = r.id === extSelId
                          return (
                            <Fragment key={r.id}>
                              <tr className={`border-t border-gray-100 transition-colors ${isSel ? 'bg-amber-50' : 'hover:bg-amber-50'}`}>
                                <td className="py-2.5 px-3 text-gray-500 text-xs whitespace-nowrap">
                                  {r.proveedores?.nombre ?? '—'}
                                </td>
                                <td className="py-2.5 px-3 text-gray-500 text-xs">{r.subgrupo ?? '—'}</td>
                                <td className="py-2.5 px-3 text-gray-900 max-w-[200px]">{r.nombre}</td>
                                <td className="py-2.5 px-3 text-center text-gray-500">{r.unidad_empaque ?? 1}</td>
                                <td className="py-2.5 px-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                                  {formatCOP(r.ultimo_precio_venta)}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  {isSel
                                    ? <button onClick={() => setExtSelId(null)}
                                        className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">✕</button>
                                    : <button onClick={() => selExt(r)}
                                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                                        + Agregar
                                      </button>
                                  }
                                </td>
                              </tr>
                              {/* Fila expandida para editar cantidad/precio */}
                              {isSel && (
                                <tr className="bg-amber-50 border-t border-amber-200">
                                  <td colSpan={6} className="px-4 py-3">
                                    <div className="flex gap-3 items-end flex-wrap">
                                      <div>
                                        <label className="text-xs text-gray-600 block mb-1">Precio al cliente</label>
                                        <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-amber-400">
                                          <span className="px-2 text-gray-400 text-sm border-r border-gray-200 py-1.5">$</span>
                                          <input type="text" inputMode="numeric"
                                            value={fmtCOP(extPrecioSel)}
                                            onChange={(e) => setExtPrecioSel(e.target.value.replace(/\D/g, ''))}
                                            className="w-28 px-2 py-1.5 text-sm font-mono text-right focus:outline-none" />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-xs text-gray-600 block mb-1">Cantidad</label>
                                        <input type="number" min={1} value={extCant}
                                          onChange={(e) => setExtCant(Math.max(1, parseInt(e.target.value) || 1))}
                                          className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
                                      </div>
                                      {extPrecioSel && (
                                        <p className="text-sm text-gray-600">
                                          Total: <span className="font-semibold">{formatCOP(parseInt(extPrecioSel.replace(/\D/g, '') || '0', 10) * extCant)}</span>
                                        </p>
                                      )}
                                      <button onClick={confirmarExt}
                                        className="ml-auto px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                                        ✓ Confirmar
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                        {!extLoading && extRows.length === 0 && (
                          <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">
                            Sin resultados — ajusta los filtros o agrega un repuesto nuevo
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {!extBuscado && (
                <p className="text-xs text-gray-400 py-2">Busca por proveedor, sub-grupo o descripción — o agrega uno nuevo</p>
              )}
            </>
          )}

          {/* ── Formulario nuevo externo ── */}
          {showForm && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Nuevo repuesto externo</h3>
                <button onClick={() => setShowForm(false)}
                  className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Proveedor con autocomplete */}
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

                {/* Teléfono */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Teléfono proveedor</label>
                  <input value={formatTel(fTel)} onChange={(e) => setFTel(soloDigitos(e.target.value))}
                    placeholder="(310) 000-0000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>

                {/* Ubicación */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Ubicación</label>
                  <input value={fUbic} onChange={(e) => setFUbic(e.target.value)}
                    placeholder="Ciudad / Dirección"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>

                {/* Sub-grupo */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Sub-tipo de repuesto</label>
                  <input value={fSub} onChange={(e) => setFSub(e.target.value)}
                    placeholder="Ej: Frenos, Motor, Eléctrico..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>

                {/* Unidad empaque */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Unidad empaque</label>
                  <input type="number" min={1} value={fUnidad} onChange={(e) => setFUnidad(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>

                {/* Descripción (col span 2) */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    Descripción <span className="text-red-400">*</span>
                  </label>
                  <input value={fDesc} onChange={(e) => setFDesc(e.target.value)}
                    placeholder="Nombre / descripción del repuesto"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>

                {/* Costo */}
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

                {/* Precio venta */}
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
              </div>

              {fError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{fError}</p>
              )}

              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                  Cancelar
                </button>
                <button onClick={guardarNuevoExt} disabled={fSaving}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
                  {fSaving && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                  Guardar y agregar al listado
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
