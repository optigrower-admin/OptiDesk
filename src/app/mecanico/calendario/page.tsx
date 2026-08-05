'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ymdLocal } from '@/lib/dashboard/periodos'

interface OrdenCita {
  id: string
  numero: number | null
  placa: string | null
  cliente: string | null
  telefono: string | null
  fecha_programada: string
  duracion_estimada_horas: number | null
  mecanico_id: string | null
  usuarios: { nombre: string } | { nombre: string }[] | null
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function nombreMecanico(u: OrdenCita['usuarios']): string {
  if (!u) return 'Sin asignar'
  return Array.isArray(u) ? (u[0]?.nombre ?? 'Sin asignar') : u.nombre
}

export default function CalendarioProfesionalPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [vista, setVista] = useState<'lista' | 'calendario'>('lista')
  const [filtro, setFiltro] = useState<'mias' | 'todas'>('mias')
  const [citas, setCitas] = useState<OrdenCita[]>([])
  const [loading, setLoading] = useState(true)
  const [mesRef, setMesRef] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.tenant_id) return
    setLoading(true)
    let q = supabase.from('ordenes')
      .select('id, numero, placa, cliente, telefono, fecha_programada, duracion_estimada_horas, mecanico_id, usuarios:mecanico_id(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .eq('estado', 'programado')
      .not('fecha_programada', 'is', null)
      .order('fecha_programada', { ascending: true })
    if (filtro === 'mias') q = q.eq('mecanico_id', profile.id)
    q.then(({ data }) => { setCitas((data as unknown as OrdenCita[]) ?? []); setLoading(false) })
  }, [profile?.tenant_id, profile?.id, filtro])

  const hoyYMD = ymdLocal(new Date())
  const proximas = useMemo(() => citas.filter(c => ymdLocal(c.fecha_programada) >= hoyYMD), [citas, hoyYMD])

  const citasPorDia = useMemo(() => {
    const m = new Map<string, OrdenCita[]>()
    for (const c of citas) {
      const k = ymdLocal(c.fecha_programada)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(c)
    }
    return m
  }, [citas])

  const diasDelMes = useMemo(() => {
    const primerDia = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1)
    const ultimoDia = new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 0)
    const inicioGrid = new Date(primerDia); inicioGrid.setDate(primerDia.getDate() - primerDia.getDay())
    const finGrid = new Date(ultimoDia); finGrid.setDate(ultimoDia.getDate() + (6 - ultimoDia.getDay()))
    const dias: Date[] = []
    for (let d = new Date(inicioGrid); d <= finGrid; d.setDate(d.getDate() + 1)) dias.push(new Date(d))
    return dias
  }, [mesRef])

  const cambiarMes = (delta: number) => {
    setMesRef(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + delta); return d })
    setDiaSeleccionado(null)
  }

  const FilaCita = ({ c }: { c: OrdenCita }) => {
    const fecha = new Date(c.fecha_programada)
    return (
      <Link href={`/mecanico/resumen/${c.id}`}
        className="flex items-center justify-between gap-3 px-4 py-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-blue-200 transition-colors">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            {fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} · {fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {c.cliente ?? 'Cliente'} {c.placa ? `· ${c.placa}` : ''}
          </p>
          {filtro === 'todas' && (
            <p className="text-[11px] text-blue-600 font-medium mt-0.5">{nombreMecanico(c.usuarios)}</p>
          )}
        </div>
        <span className="text-[11px] text-gray-400 flex-shrink-0">{c.duracion_estimada_horas ?? 1}h</span>
      </Link>
    )
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">📅 Calendario</h1>
        <Link href="/mecanico/calendario/horario" className="text-xs font-semibold text-blue-600 hover:underline">
          Mi horario →
        </Link>
      </div>

      <div className="flex gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium flex-1">
          {(['lista', 'calendario'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              className={`flex-1 py-2 transition-colors ${vista === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}>
              {v === 'lista' ? '☰ Lista' : '🗓️ Calendario'}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium flex-1">
          {(['mias', 'todas'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`flex-1 py-2 transition-colors ${filtro === f ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>
              {f === 'mias' ? 'Mis citas' : 'Todo el taller'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-sm text-gray-400 py-10">Cargando...</p>
      ) : vista === 'lista' ? (
        proximas.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">Sin citas programadas próximamente 🎉</p>
        ) : (
          <div className="space-y-2">
            {proximas.map(c => <FilaCita key={c.id} c={c} />)}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => cambiarMes(-1)} className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500">‹</button>
            <p className="font-semibold text-sm text-gray-800">{MESES[mesRef.getMonth()]} {mesRef.getFullYear()}</p>
            <button onClick={() => cambiarMes(1)} className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-400">
            {DIAS_SEMANA.map(d => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {diasDelMes.map(d => {
              const ymd = ymdLocal(d)
              const enMes = d.getMonth() === mesRef.getMonth()
              const n = citasPorDia.get(ymd)?.length ?? 0
              const esHoy = ymd === hoyYMD
              return (
                <button key={ymd} onClick={() => setDiaSeleccionado(ymd === diaSeleccionado ? null : ymd)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs relative ${
                    !enMes ? 'text-gray-300' : diaSeleccionado === ymd ? 'bg-blue-600 text-white font-bold' : esHoy ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  {d.getDate()}
                  {n > 0 && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${diaSeleccionado === ymd ? 'bg-white' : 'bg-emerald-500'}`} />}
                </button>
              )
            })}
          </div>

          {diaSeleccionado && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {new Date(diaSeleccionado + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              {(citasPorDia.get(diaSeleccionado) ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Sin citas ese día</p>
              ) : (
                (citasPorDia.get(diaSeleccionado) ?? []).map(c => <FilaCita key={c.id} c={c} />)
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
