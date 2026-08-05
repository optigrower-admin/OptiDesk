'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, Fragment } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

interface ColorRow { id: string; colorId: string | null; colorNombre: string | null; cantidad: number }
interface InventarioRow {
  moto_catalogo_id: string
  referencia: string
  cantidad_total: number
  comprometidas: number
  para_entregar: number
  entregadas: number
  disponibles: number
  colores: ColorRow[]
}
interface MotoOpcion { id: string; referencia: string }
interface ColorOpcion { id: string; moto_catalogo_id: string; nombre: string }

export default function InventarioMotosPage() {
  const { profile } = useAuth()
  const rolNorm = (profile?.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'

  const [filas, setFilas] = useState<InventarioRow[]>([])
  const [motosDisponibles, setMotosDisponibles] = useState<MotoOpcion[]>([])
  const [coloresCatalogo, setColoresCatalogo] = useState<ColorOpcion[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<Set<string>>(new Set())

  const [showEntrada, setShowEntrada] = useState(false)
  const [motoEntradaId, setMotoEntradaId] = useState('')
  const [colorEntradaId, setColorEntradaId] = useState('')
  const [cantidadEntrada, setCantidadEntrada] = useState('')
  const [guardandoEntrada, setGuardandoEntrada] = useState(false)
  const [okEntrada, setOkEntrada] = useState(false)

  const cargar = () => {
    setLoading(true)
    fetch('/api/admin/ventas/inventario')
      .then(r => r.json())
      .then(d => {
        setFilas(d.inventario ?? [])
        setMotosDisponibles(d.motosDisponibles ?? [])
        setColoresCatalogo(d.coloresPorMoto ?? [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])

  const coloresPorMoto = useMemo(() => {
    const m = new Map<string, ColorOpcion[]>()
    for (const c of coloresCatalogo) {
      if (!m.has(c.moto_catalogo_id)) m.set(c.moto_catalogo_id, [])
      m.get(c.moto_catalogo_id)!.push(c)
    }
    return m
  }, [coloresCatalogo])
  const coloresMotoEntrada = motoEntradaId ? (coloresPorMoto.get(motoEntradaId) ?? []) : []

  const toggle = (motoId: string) => setExpandido(prev => {
    const n = new Set(prev)
    n.has(motoId) ? n.delete(motoId) : n.add(motoId)
    return n
  })

  const registrarEntrada = async () => {
    if (!motoEntradaId) return
    if (coloresMotoEntrada.length > 0 && !colorEntradaId) return
    setGuardandoEntrada(true)
    const r = await fetch('/api/admin/ventas/inventario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'entrada', moto_catalogo_id: motoEntradaId, color_id: colorEntradaId || null,
        cantidad_entrada: Number(cantidadEntrada) || 0,
      }),
    })
    setGuardandoEntrada(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      alert(d.error ?? 'No se pudo registrar la entrada')
      return
    }
    setMotoEntradaId(''); setColorEntradaId(''); setCantidadEntrada(''); setShowEntrada(false)
    setOkEntrada(true); setTimeout(() => setOkEntrada(false), 2500)
    cargar()
  }

  const totales = filas.reduce((s, f) => ({
    disponibles: s.disponibles + f.disponibles,
    comprometidas: s.comprometidas + f.comprometidas,
    para_entregar: s.para_entregar + f.para_entregar,
  }), { disponibles: 0, comprometidas: 0, para_entregar: 0 })

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventario de motos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Disponibles, comprometidas y para entregar, según el pipeline de ventas en vivo</p>
        </div>
        <div className="flex items-center gap-3">
          {okEntrada && <span className="text-xs font-medium text-emerald-600">✓ Entrada registrada</span>}
          <button onClick={() => setShowEntrada(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap">
            + Registrar entrada
          </button>
          {esGerencia && (
            <Link href="/admin/config-ventas" className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap">
              Editar/eliminar en Config Ventas →
            </Link>
          )}
        </div>
      </div>

      {showEntrada && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-emerald-900">Registrar entrada de motos (ej. hoy llegaron unidades nuevas)</p>
            <button onClick={() => setShowEntrada(false)} className="text-emerald-400 hover:text-emerald-700 text-sm">✕</button>
          </div>
          <p className="text-xs text-emerald-700">Cualquier rol puede registrar entradas — solo suman a lo que ya hay, nunca borran ni corrigen el total.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={motoEntradaId} onChange={e => { setMotoEntradaId(e.target.value); setColorEntradaId('') }}
              className="flex-1 min-w-[160px] border border-emerald-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="">Selecciona una moto...</option>
              {motosDisponibles.map(m => <option key={m.id} value={m.id}>{m.referencia}</option>)}
            </select>
            {coloresMotoEntrada.length > 0 && (
              <select value={colorEntradaId} onChange={e => setColorEntradaId(e.target.value)}
                className="border border-emerald-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                <option value="">Color...</option>
                {coloresMotoEntrada.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
            <input type="number" min={1} placeholder="Cantidad que llegó" value={cantidadEntrada} onChange={e => setCantidadEntrada(e.target.value)}
              className="w-40 border border-emerald-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <button onClick={registrarEntrada}
              disabled={!motoEntradaId || !cantidadEntrada || (coloresMotoEntrada.length > 0 && !colorEntradaId) || guardandoEntrada}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold whitespace-nowrap">
              {guardandoEntrada ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400">Cargando...</div>
      ) : filas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-sm text-gray-400">
          Todavía no hay motos en el inventario. Agrégalas con &quot;+ Registrar entrada&quot; arriba, o desde <Link href="/admin/config-ventas" className="text-blue-600 hover:underline">Config Ventas</Link>.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Moto</th>
                  <th className="px-4 py-3 text-right">Disponibles</th>
                  <th className="px-4 py-3 text-right">Comprometidas</th>
                  <th className="px-4 py-3 text-right">Para entregar</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => {
                  const tieneColores = f.colores.some(c => c.colorNombre)
                  const abierto = expandido.has(f.moto_catalogo_id)
                  return (
                    <Fragment key={f.moto_catalogo_id}>
                      <tr className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {tieneColores ? (
                            <button onClick={() => toggle(f.moto_catalogo_id)} className="flex items-center gap-1.5 hover:text-blue-700">
                              <svg className={`w-3 h-3 text-gray-400 transition-transform ${abierto ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              {f.referencia}
                            </button>
                          ) : f.referencia}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${f.disponibles > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{f.disponibles}</td>
                        <td className="px-4 py-3 text-right text-amber-700">{f.comprometidas}</td>
                        <td className="px-4 py-3 text-right text-blue-700">{f.para_entregar}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{f.cantidad_total}</td>
                      </tr>
                      {abierto && tieneColores && f.colores.map(c => (
                        <tr key={c.id} className="border-b border-gray-50 last:border-0 bg-gray-50/60">
                          <td className="px-4 py-1.5 pl-10 text-xs text-gray-500">{c.colorNombre ?? 'Sin color'}</td>
                          <td className="px-4 py-1.5 text-right text-xs text-gray-400" colSpan={3}>—</td>
                          <td className="px-4 py-1.5 text-right text-xs font-semibold text-gray-600">{c.cantidad}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-gray-600">Total</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{totales.disponibles}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{totales.comprometidas}</td>
                  <td className="px-4 py-3 text-right text-blue-700">{totales.para_entregar}</td>
                  <td className="px-4 py-3 text-right text-gray-400">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 px-4 py-2 border-t border-gray-50">
            Comprometidas: en Vendida/Carta Aprobación hasta antes de En matrícula · Para entregar: En matrícula hasta antes de Entregada · las Entregadas ya se descontaron del total. El desglose por color es el stock registrado — el pipeline no distingue qué color compró cada cliente.
          </p>
        </div>
      )}
    </div>
  )
}
