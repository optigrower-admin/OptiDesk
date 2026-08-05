'use client'
import { useState, useEffect } from 'react'

interface InventarioRow {
  id: string
  moto_catalogo_id: string
  referencia: string
  cantidad_total: number
  comprometidas: number
  para_entregar: number
  disponibles: number
}
interface MotoOpcion { id: string; referencia: string }

export default function InventarioMotosConfig() {
  const [filas, setFilas] = useState<InventarioRow[]>([])
  const [motosDisponibles, setMotosDisponibles] = useState<MotoOpcion[]>([])
  const [loading, setLoading] = useState(true)
  const [motoNuevaId, setMotoNuevaId] = useState('')
  const [cantidadNueva, setCantidadNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoValor, setEditandoValor] = useState('')

  const cargar = () => {
    setLoading(true)
    fetch('/api/admin/ventas/inventario')
      .then(r => r.json())
      .then(d => { setFilas(d.inventario ?? []); setMotosDisponibles(d.motosDisponibles ?? []) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { cargar() }, [])

  const motosSinInventario = motosDisponibles.filter(m => !filas.some(f => f.moto_catalogo_id === m.id))

  const agregar = async () => {
    if (!motoNuevaId) return
    setGuardando(true)
    await fetch('/api/admin/ventas/inventario', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'crear', moto_catalogo_id: motoNuevaId, cantidad_total: Number(cantidadNueva) || 0 }),
    })
    setMotoNuevaId(''); setCantidadNueva(''); setGuardando(false)
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
    if (!confirm('¿Quitar esta moto del inventario? Ya no se hará seguimiento de disponibilidad para ella.')) return
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
        Ingresa la cantidad total de unidades por moto. Comprometidas y Para entregar se calculan solas según los
        clientes en el pipeline — no se editan a mano.
      </p>

      {filas.length > 0 && (
        <div className="space-y-1.5">
          {filas.map(f => (
            <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 truncate">{f.referencia}</p>
                <p className="text-[11px] text-gray-400">
                  Disponibles {f.disponibles} · Comprometidas {f.comprometidas} · Para entregar {f.para_entregar}
                </p>
              </div>
              {editandoId === f.id ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input type="number" min={0} value={editandoValor} onChange={e => setEditandoValor(e.target.value)}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center" autoFocus />
                  <button onClick={() => guardarEdicion(f.id)} className="text-xs font-semibold text-blue-600 hover:underline">Guardar</button>
                  <button onClick={() => setEditandoId(null)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-bold text-gray-700">{f.cantidad_total} total</span>
                  <button onClick={() => { setEditandoId(f.id); setEditandoValor(String(f.cantidad_total)) }}
                    className="text-gray-400 hover:text-blue-600 text-xs">✏️</button>
                  <button onClick={() => eliminar(f.id)} className="text-gray-400 hover:text-red-600 text-xs">🗑</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {motosSinInventario.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <select value={motoNuevaId} onChange={e => setMotoNuevaId(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Selecciona una moto...</option>
            {motosSinInventario.map(m => <option key={m.id} value={m.id}>{m.referencia}</option>)}
          </select>
          <input type="number" min={0} placeholder="Cantidad" value={cantidadNueva} onChange={e => setCantidadNueva(e.target.value)}
            className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={agregar} disabled={!motoNuevaId || guardando}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors whitespace-nowrap">
            + Agregar
          </button>
        </div>
      )}
      {motosDisponibles.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Primero agrega vehículos al catálogo arriba.</p>
      )}
    </div>
  )
}
