'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

type Secuencia = { id: string; nombre: string; activa: boolean; created_at: string }
type Paso = { id?: string; secuencia_id?: string; contenido: string; dias_despues: number; orden?: number }

export default function SecuenciasPage() {
  const { profile } = useAuth()
  const [secuencias, setSecuencias] = useState<Secuencia[]>([])
  const [mensajes, setMensajes] = useState<(Paso & { secuencia_id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<Secuencia | 'new' | null>(null)
  const [nombreForm, setNombreForm] = useState('')
  const [pasosForm, setPasosForm] = useState<Paso[]>([{ contenido: '', dias_despues: 0 }])
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/mensajes/secuencias')
    const j = await r.json()
    setSecuencias(j.secuencias ?? [])
    setMensajes(j.mensajes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const abrirNueva = () => { setEditando('new'); setNombreForm(''); setPasosForm([{ contenido: '', dias_despues: 0 }]) }
  const abrirEditar = (s: Secuencia) => {
    setEditando(s)
    setNombreForm(s.nombre)
    const pasos = mensajes.filter(m => m.secuencia_id === s.id).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    setPasosForm(pasos.length ? pasos.map(p => ({ contenido: p.contenido, dias_despues: p.dias_despues })) : [{ contenido: '', dias_despues: 0 }])
  }

  const updPaso = (i: number, patch: Partial<Paso>) => setPasosForm(ps => ps.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  const agregarPaso = () => setPasosForm(ps => [...ps, { contenido: '', dias_despues: 1 }])
  const quitarPaso = (i: number) => setPasosForm(ps => ps.filter((_, idx) => idx !== i))

  const guardar = async () => {
    if (!nombreForm.trim()) return
    setGuardando(true)
    const pasos = pasosForm.filter(p => p.contenido.trim())
    try {
      await fetch('/api/admin/mensajes/secuencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando === 'new'
          ? { accion: 'crear', nombre: nombreForm, pasos }
          : { accion: 'editar', id: (editando as Secuencia).id, nombre: nombreForm, pasos }),
      })
      setEditando(null)
      cargar()
    } finally {
      setGuardando(false)
    }
  }

  const toggleActiva = async (s: Secuencia) => {
    await fetch('/api/admin/mensajes/secuencias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'toggle_activa', id: s.id, activa: !s.activa }),
    })
    cargar()
  }

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta secuencia? Los clientes suscritos dejarán de recibir mensajes.')) return
    await fetch('/api/admin/mensajes/secuencias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'eliminar', id }),
    })
    cargar()
  }

  const esGerencia = ['gerencia', 'dueno', 'control_total'].includes(profile?.rol ?? '')

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Secuencias de mensajes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Mensajes de goteo automático — se usan desde el nodo &quot;Acción&quot; en Flujos (Suscribir/Dar de baja de Secuencia).</p>
        </div>
        {esGerencia && (
          <button onClick={abrirNueva} className="px-4 py-2 bg-blue-700 text-white rounded-xl text-sm font-medium hover:bg-blue-800">
            + Nueva secuencia
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : secuencias.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <span className="text-4xl block mb-3">📨</span>
          <h3 className="font-semibold text-gray-900 mb-1">Sin secuencias aún</h3>
          <p className="text-sm text-gray-500">Crea una secuencia de mensajes automáticos escalonados en el tiempo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {secuencias.map(s => {
            const pasos = mensajes.filter(m => m.secuencia_id === s.id)
            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
                <button onClick={() => toggleActiva(s)} className={`relative w-10 h-6 rounded-full flex-shrink-0 ${s.activa ? 'bg-green-500' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${s.activa ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{s.nombre}</p>
                  <p className="text-xs text-gray-400">{pasos.length} mensaje(s)</p>
                </div>
                <button onClick={() => abrirEditar(s)} className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Editar</button>
                {esGerencia && <button onClick={() => eliminar(s.id)} className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Eliminar</button>}
              </div>
            )
          })}
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900">{editando === 'new' ? 'Nueva secuencia' : 'Editar secuencia'}</h3>
            <input value={nombreForm} onChange={e => setNombreForm(e.target.value)} placeholder="Nombre de la secuencia"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />

            <div className="space-y-2">
              {pasosForm.map((p, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Mensaje {i + 1}</span>
                    <button onClick={() => quitarPaso(i)} className="text-red-400 hover:text-red-600 text-xs">Quitar</button>
                  </div>
                  <textarea value={p.contenido} onChange={e => updPaso(i, { contenido: e.target.value })} rows={2}
                    placeholder="Contenido del mensaje... usa {{nombre}}" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono resize-none" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-500">Días después de{i === 0 ? ' suscribirse' : ' el anterior'}:</span>
                    <input type="number" min={0} value={p.dias_despues} onChange={e => updPaso(i, { dias_despues: Number(e.target.value) })}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                  </div>
                </div>
              ))}
              <button onClick={agregarPaso} className="w-full text-xs text-blue-600 border border-dashed border-gray-300 rounded-lg py-1.5 hover:border-blue-400">+ Añadir mensaje</button>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditando(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !nombreForm.trim()} className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
