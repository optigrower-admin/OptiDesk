'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

interface Bloqueo {
  id: string
  tipo: 'recurrente' | 'puntual'
  dia_semana: number | null
  fecha: string | null
  hora_inicio: string
  hora_fin: string
  motivo: string
}

const DIAS = [
  { v: 1, label: 'Lun' }, { v: 2, label: 'Mar' }, { v: 3, label: 'Mié' }, { v: 4, label: 'Jue' },
  { v: 5, label: 'Vie' }, { v: 6, label: 'Sáb' }, { v: 0, label: 'Dom' },
]

export default function MiHorarioPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([])
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [tab, setTab] = useState<'recurrente' | 'puntual'>('recurrente')
  const [mostrarExito, setMostrarExito] = useState(false)
  const [errorModal, setErrorModal] = useState('')

  const [diasSel, setDiasSel] = useState<Set<number>>(new Set())
  const [horaInicio, setHoraInicio] = useState('12:00')
  const [horaFin, setHoraFin] = useState('13:00')
  const [motivo, setMotivo] = useState('Almuerzo')
  const [guardandoRecurrente, setGuardandoRecurrente] = useState(false)

  const [fechaPuntual, setFechaPuntual] = useState('')
  const [horaInicioP, setHoraInicioP] = useState('12:00')
  const [horaFinP, setHoraFinP] = useState('13:00')
  const [motivoP, setMotivoP] = useState('')
  const [guardandoPuntual, setGuardandoPuntual] = useState(false)

  const cargar = () => {
    if (!profile?.id) return
    setLoading(true)
    supabase.from('mecanico_bloqueos_horario').select('id, tipo, dia_semana, fecha, hora_inicio, hora_fin, motivo')
      .eq('usuario_id', profile.id).order('dia_semana').order('fecha')
      .then(({ data }) => { setBloqueos((data as Bloqueo[]) ?? []); setLoading(false) })
  }
  useEffect(() => { cargar() }, [profile?.id])

  const toggleDia = (v: number) => setDiasSel(prev => {
    const n = new Set(prev)
    n.has(v) ? n.delete(v) : n.add(v)
    return n
  })

  const abrirModal = (t: 'recurrente' | 'puntual') => {
    setTab(t)
    setErrorModal('')
    setShowModal(true)
  }

  const cerrarConExito = () => {
    setShowModal(false)
    setDiasSel(new Set())
    setFechaPuntual(''); setMotivoP('')
    cargar()
    setMostrarExito(true)
    setTimeout(() => setMostrarExito(false), 1400)
  }

  const agregarRecurrente = async () => {
    if (!profile?.tenant_id || !profile.id || diasSel.size === 0) return
    if (horaFin <= horaInicio) { setErrorModal('La hora de fin debe ser después de la hora de inicio'); return }
    setErrorModal('')
    setGuardandoRecurrente(true)
    const resultados = await Promise.all([...diasSel].map(dia =>
      supabase.from('mecanico_bloqueos_horario').insert({
        tenant_id: profile.tenant_id, usuario_id: profile.id, tipo: 'recurrente',
        dia_semana: dia, hora_inicio: horaInicio, hora_fin: horaFin, motivo: motivo.trim() || 'Almuerzo',
      })
    ))
    setGuardandoRecurrente(false)
    const conError = resultados.find(r => r.error)
    if (conError?.error) { setErrorModal(conError.error.message); return }
    cerrarConExito()
  }

  const agregarPuntual = async () => {
    if (!profile?.tenant_id || !profile.id || !fechaPuntual) return
    if (horaFinP <= horaInicioP) { setErrorModal('La hora de fin debe ser después de la hora de inicio'); return }
    setErrorModal('')
    setGuardandoPuntual(true)
    const { error } = await supabase.from('mecanico_bloqueos_horario').insert({
      tenant_id: profile.tenant_id, usuario_id: profile.id, tipo: 'puntual',
      fecha: fechaPuntual, hora_inicio: horaInicioP, hora_fin: horaFinP, motivo: motivoP.trim() || 'Bloqueo',
    })
    setGuardandoPuntual(false)
    if (error) { setErrorModal(error.message); return }
    cerrarConExito()
  }

  const eliminar = async (id: string) => {
    if (!confirm('¿Quitar este bloqueo de tu horario?')) return
    const { error } = await supabase.from('mecanico_bloqueos_horario').delete().eq('id', id)
    if (error) { alert(`No se pudo quitar: ${error.message}`); return }
    cargar()
  }

  const recurrentes = bloqueos.filter(b => b.tipo === 'recurrente')
  const puntuales = bloqueos.filter(b => b.tipo === 'puntual').filter(b => !b.fecha || b.fecha >= new Date().toISOString().slice(0, 10))

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/mecanico/calendario" className="text-gray-400 hover:text-gray-700">←</Link>
        <h1 className="text-lg font-bold text-gray-900">Mi horario</h1>
      </div>
      <p className="text-xs text-gray-500">
        Bloquea tu hora de almuerzo u otros momentos en que no puedes recibir citas — no se te van a poder agendar servicios en esos horarios.
      </p>

      <button onClick={() => abrirModal('recurrente')}
        className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold shadow-sm">
        + Agendar
      </button>

      {loading ? (
        <p className="text-center text-sm text-gray-400 py-6">Cargando...</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h2 className="font-semibold text-sm text-gray-900">Horario recurrente (cada semana)</h2>
            {recurrentes.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Sin bloqueos recurrentes.</p>
            ) : (
              <div className="space-y-1.5">
                {recurrentes.map(b => (
                  <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50">
                    <span className="text-xs text-gray-700">
                      {DIAS.find(d => d.v === b.dia_semana)?.label} · {b.hora_inicio.slice(0, 5)}–{b.hora_fin.slice(0, 5)} · {b.motivo}
                    </span>
                    <button onClick={() => eliminar(b.id)} className="text-gray-400 hover:text-red-600 text-xs flex-shrink-0">🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h2 className="font-semibold text-sm text-gray-900">Fechas puntuales (una sola vez)</h2>
            {puntuales.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Sin fechas puntuales próximas.</p>
            ) : (
              <div className="space-y-1.5">
                {puntuales.map(b => (
                  <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50">
                    <span className="text-xs text-gray-700">
                      {b.fecha && new Date(b.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · {b.hora_inicio.slice(0, 5)}–{b.hora_fin.slice(0, 5)} · {b.motivo}
                    </span>
                    <button onClick={() => eliminar(b.id)} className="text-gray-400 hover:text-red-600 text-xs flex-shrink-0">🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
              <h2 className="font-bold text-gray-900">+ Agendar bloqueo</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>

            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium mx-5 mt-4">
              {([{ v: 'recurrente', label: 'Cada semana' }, { v: 'puntual', label: 'Una sola vez' }] as const).map(t => (
                <button key={t.v} onClick={() => { setTab(t.v); setErrorModal('') }}
                  className={`flex-1 py-2 transition-colors ${tab === t.v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {errorModal && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{errorModal}</div>
              )}

              {tab === 'recurrente' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Días</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DIAS.map(d => (
                        <button key={d.v} type="button" onClick={() => toggleDia(d.v)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${diasSel.has(d.v) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Horario</label>
                    <div className="flex items-center gap-2">
                      <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                      <span className="text-gray-400 text-sm">–</span>
                      <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Motivo</label>
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Almuerzo"
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                    <input type="date" value={fechaPuntual} onChange={e => setFechaPuntual(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Horario</label>
                    <div className="flex items-center gap-2">
                      <input type="time" value={horaInicioP} onChange={e => setHoraInicioP(e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                      <span className="text-gray-400 text-sm">–</span>
                      <input type="time" value={horaFinP} onChange={e => setHoraFinP(e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Motivo</label>
                    <input value={motivoP} onChange={e => setMotivoP(e.target.value)} placeholder="Ej: Cita médica"
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t flex-shrink-0">
              {tab === 'recurrente' ? (
                <button onClick={agregarRecurrente} disabled={diasSel.size === 0 || guardandoRecurrente}
                  className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">
                  {guardandoRecurrente ? 'Guardando...' : 'Guardar bloqueo'}
                </button>
              ) : (
                <button onClick={agregarPuntual} disabled={!fechaPuntual || guardandoPuntual}
                  className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded-lg text-sm font-semibold">
                  {guardandoPuntual ? 'Guardando...' : 'Guardar bloqueo'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {mostrarExito && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-8 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-bold text-gray-900">Agendado con éxito</p>
          </div>
        </div>
      )}
    </div>
  )
}
