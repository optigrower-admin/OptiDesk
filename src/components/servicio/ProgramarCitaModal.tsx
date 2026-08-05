'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ymdLocal } from '@/lib/dashboard/periodos'
import { obtenerOcupacionMecanico, generarSlots, type OcupacionItem, type Slot } from '@/lib/servicio/disponibilidad'

interface Mecanico { id: string; nombre: string }

interface Props {
  tenantId: string
  onClose: () => void
  onConfirm: (data: { mecanicoId: string; mecanicoNombre: string; fechaISO: string; duracionHoras: number }) => void
  mecanicoInicialId?: string
  ordenIdExcluir?: string
}

export function ProgramarCitaModal({ tenantId, onClose, onConfirm, mecanicoInicialId, ordenIdExcluir }: Props) {
  const supabase = createClient()
  const [mecanicos, setMecanicos] = useState<Mecanico[]>([])
  const [mecanicoId, setMecanicoId] = useState(mecanicoInicialId ?? '')
  const [fecha, setFecha] = useState(ymdLocal(new Date()))
  const [duracionHoras, setDuracionHoras] = useState('1')
  const [ocupacion, setOcupacion] = useState<OcupacionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [slotElegido, setSlotElegido] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('usuarios').select('id, nombre').eq('tenant_id', tenantId).eq('rol', 'mecanico').eq('activo', true).order('nombre')
      .then(({ data }) => {
        const rows = (data as Mecanico[]) ?? []
        setMecanicos(rows)
        if (!mecanicoId && rows.length === 1) setMecanicoId(rows[0].id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const cargarOcupacion = useCallback(async () => {
    if (!mecanicoId || !fecha) { setOcupacion([]); return }
    setLoading(true)
    setSlotElegido(null)
    const data = await obtenerOcupacionMecanico(supabase, tenantId, mecanicoId, fecha, ordenIdExcluir)
    setOcupacion(data)
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mecanicoId, fecha, tenantId, ordenIdExcluir])

  useEffect(() => { cargarOcupacion() }, [cargarOcupacion])

  const duracionMin = Math.round((parseFloat(duracionHoras) || 1) * 60)
  const slots: Slot[] = generarSlots(ocupacion, duracionMin)
  const mecanicoNombre = mecanicos.find(m => m.id === mecanicoId)?.nombre ?? ''

  const cambiarDia = (delta: number) => {
    const d = new Date(fecha + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setFecha(ymdLocal(d))
  }

  const confirmar = () => {
    if (!mecanicoId || !slotElegido) return
    const [h, m] = slotElegido.split(':').map(Number)
    const d = new Date(fecha + 'T12:00:00')
    d.setHours(h, m, 0, 0)
    onConfirm({ mecanicoId, mecanicoNombre, fechaISO: d.toISOString(), duracionHoras: parseFloat(duracionHoras) || 1 })
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <h2 className="font-bold text-gray-900">📅 Programar cita</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mecánico *</label>
            <select value={mecanicoId} onChange={e => setMecanicoId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Selecciona un mecánico...</option>
              {mecanicos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            {mecanicos.length === 0 && <p className="text-xs text-amber-600 mt-1">No hay mecánicos activos registrados.</p>}
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => cambiarDia(-1)} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">‹</button>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="button" onClick={() => cambiarDia(1)} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">›</button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Duración estimada (horas)</label>
            <input type="number" step="0.5" min="0.5" value={duracionHoras} onChange={e => setDuracionHoras(e.target.value)}
              className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {!mecanicoId ? (
            <p className="text-sm text-gray-400 text-center py-6">Elige un mecánico para ver sus horarios disponibles.</p>
          ) : loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Buscando espacios disponibles...</p>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Espacios disponibles</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {slots.map(s => (
                    <button key={s.hora} type="button" disabled={!s.disponible}
                      onClick={() => setSlotElegido(s.hora)}
                      className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                        !s.disponible ? 'bg-gray-100 text-gray-300 cursor-not-allowed line-through'
                          : slotElegido === s.hora ? 'bg-blue-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                      }`}>
                      {s.hora}
                    </button>
                  ))}
                </div>
                {slots.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Sin espacios ese día con esa duración.</p>}
              </div>

              {ocupacion.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ese día ya tiene</p>
                  <div className="space-y-1">
                    {ocupacion.map((o, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-gray-50">
                        <span className="text-gray-600">{o.horaInicio} – {o.horaFin} · {o.motivo}</span>
                        <span className={`px-1.5 py-0.5 rounded-full font-semibold ${o.origen === 'cita' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {o.origen === 'cita' ? 'Cita' : 'Bloqueo'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={confirmar} disabled={!mecanicoId || !slotElegido}
            className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">
            {slotElegido ? `Confirmar ${slotElegido}` : 'Elige un espacio'}
          </button>
        </div>
      </div>
    </div>
  )
}
