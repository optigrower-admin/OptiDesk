'use client'
import { useState, useEffect, useMemo } from 'react'

interface ColorRow { id: string; colorId: string | null; colorNombre: string | null; cantidad: number }
interface InventarioRow {
  moto_catalogo_id: string
  referencia: string
  cantidad_total: number
  comprometidas: number
  para_entregar: number
  disponibles: number
  colores: ColorRow[]
}
interface MotoOpcion { id: string; referencia: string }
interface ColorOpcion { id: string; moto_catalogo_id: string; nombre: string }

export default function InventarioMotosConfig() {
  const [filas, setFilas] = useState<InventarioRow[]>([])
  const [motosDisponibles, setMotosDisponibles] = useState<MotoOpcion[]>([])
  const [coloresCatalogo, setColoresCatalogo] = useState<ColorOpcion[]>([])
  const [loading, setLoading] = useState(true)
  const [motoNuevaId, setMotoNuevaId] = useState('')
  const [colorNuevoId, setColorNuevoId] = useState('')
  const [cantidadNueva, setCantidadNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoValor, setEditandoValor] = useState('')
  const [colorExtraPorMoto, setColorExtraPorMoto] = useState<Record<string, { colorId: string; cantidad: string }>>({})

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

  const motosSinInventario = motosDisponibles.filter(m => !filas.some(f => f.moto_catalogo_id === m.id))
  const coloresMotoNueva = motoNuevaId ? (coloresPorMoto.get(motoNuevaId) ?? []) : []

  const agregar = async () => {
    if (!motoNuevaId) return
    if (coloresMotoNueva.length > 0 && !colorNuevoId) return
    setGuardando(true)
    await fetch('/api/admin/ventas/inventario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'crear', moto_catalogo_id: motoNuevaId, color_id: colorNuevoId || null,
        cantidad_total: Number(cantidadNueva) || 0,
      }),
    })
    setMotoNuevaId(''); setColorNuevoId(''); setCantidadNueva(''); setGuardando(false)
    cargar()
  }

  const agregarColorExtra = async (motoId: string) => {
    const extra = colorExtraPorMoto[motoId]
    if (!extra?.colorId) return
    await fetch('/api/admin/ventas/inventario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'crear', moto_catalogo_id: motoId, color_id: extra.colorId, cantidad_total: Number(extra.cantidad) || 0 }),
    })
    setColorExtraPorMoto(prev => ({ ...prev, [motoId]: { colorId: '', cantidad: '' } }))
    cargar()
  }

  const guardarEdicion = async (id: string) => {
    await fetch('/api/admin/ventas/inventario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'editar', id, cantidad_total: Number(editandoValor) || 0 }),
    })
    setEditandoId(null)
    cargar()
  }

  const eliminar = async (id: string) => {
    if (!confirm('¿Quitar este renglón del inventario?')) return
    await fetch('/api/admin/ventas/inventario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'eliminar', id }),
    })
    cargar()
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Cargando...</div>

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs text-gray-400">
        Si una moto tiene colores definidos en la Lista de Precios, aquí puedes llevar la cantidad disponible de
        cada color por separado. Comprometidas y Para entregar se calculan solas según los clientes en el
        pipeline — no se editan a mano.
      </p>

      {filas.length > 0 && (
        <div className="space-y-3">
          {filas.map(f => {
            const coloresDisponiblesParaAgregar = (coloresPorMoto.get(f.moto_catalogo_id) ?? [])
              .filter(c => !f.colores.some(fc => fc.colorId === c.id))
            const extra = colorExtraPorMoto[f.moto_catalogo_id] ?? { colorId: '', cantidad: '' }
            return (
              <div key={f.moto_catalogo_id} className="rounded-lg bg-gray-50 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-gray-800">{f.referencia}</p>
                  <p className="text-[11px] text-gray-400">
                    Disponibles {f.disponibles} · Comprometidas {f.comprometidas} · Para entregar {f.para_entregar} · Total {f.cantidad_total}
                  </p>
                </div>
                <div className="space-y-1">
                  {f.colores.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white border border-gray-100">
                      <span className="text-sm text-gray-700">{c.colorNombre ?? 'Sin color definido'}</span>
                      {editandoId === c.id ? (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <input type="number" min={0} value={editandoValor} onChange={e => setEditandoValor(e.target.value)}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center" autoFocus />
                          <button onClick={() => guardarEdicion(c.id)} className="text-xs font-semibold text-blue-600 hover:underline">Guardar</button>
                          <button onClick={() => setEditandoId(null)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-bold text-gray-700">{c.cantidad}</span>
                          <button onClick={() => { setEditandoId(c.id); setEditandoValor(String(c.cantidad)) }}
                            className="text-gray-400 hover:text-blue-600 text-xs">✏️</button>
                          <button onClick={() => eliminar(c.id)} className="text-gray-400 hover:text-red-600 text-xs">🗑</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {coloresDisponiblesParaAgregar.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <select value={extra.colorId} onChange={e => setColorExtraPorMoto(prev => ({ ...prev, [f.moto_catalogo_id]: { ...extra, colorId: e.target.value } }))}
                      className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">+ Agregar color...</option>
                      {coloresDisponiblesParaAgregar.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <input type="number" min={0} placeholder="Cant." value={extra.cantidad}
                      onChange={e => setColorExtraPorMoto(prev => ({ ...prev, [f.moto_catalogo_id]: { ...extra, cantidad: e.target.value } }))}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={() => agregarColorExtra(f.moto_catalogo_id)} disabled={!extra.colorId}
                      className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold whitespace-nowrap">
                      Agregar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {motosSinInventario.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-gray-100">
          <div className="flex items-center gap-2 pt-2">
            <select value={motoNuevaId} onChange={e => { setMotoNuevaId(e.target.value); setColorNuevoId('') }}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Selecciona una moto...</option>
              {motosSinInventario.map(m => <option key={m.id} value={m.id}>{m.referencia}</option>)}
            </select>
            {coloresMotoNueva.length > 0 && (
              <select value={colorNuevoId} onChange={e => setColorNuevoId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Color...</option>
                {coloresMotoNueva.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
            <input type="number" min={0} placeholder="Cantidad" value={cantidadNueva} onChange={e => setCantidadNueva(e.target.value)}
              className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={agregar} disabled={!motoNuevaId || (coloresMotoNueva.length > 0 && !colorNuevoId) || guardando}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap">
              + Agregar
            </button>
          </div>
          {coloresMotoNueva.length > 0 && (
            <p className="text-[11px] text-gray-400">Esta moto tiene colores definidos — se agrega uno a la vez, luego puedes sumar los demás colores abajo.</p>
          )}
        </div>
      )}
      {motosDisponibles.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Primero agrega vehículos al catálogo arriba.</p>
      )}
    </div>
  )
}
