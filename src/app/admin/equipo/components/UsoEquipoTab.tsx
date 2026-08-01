'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UsoUsuario {
  id: string
  nombre: string
  email: string
  rol: string
  activo: boolean
  presencia: 'activo' | 'inactivo' | 'cerrado'
  pagina_actual: string | null
  ultima_conexion: string | null
  tiempo_activo_hoy_seg: number
  tiempo_activo_semana_seg: number
  acciones_semana: number
  almacenamiento_bytes: number
  paginas_frecuentes: string[]
}

const PRESENCIA_INFO: Record<UsoUsuario['presencia'], { label: string; dot: string; text: string }> = {
  activo:   { label: 'Activo ahora',        dot: 'bg-emerald-400', text: 'text-emerald-700' },
  inactivo: { label: 'Abierto, sin usar',   dot: 'bg-amber-400',   text: 'text-amber-700' },
  cerrado:  { label: 'Cerrado',             dot: 'bg-gray-300',    text: 'text-gray-400' },
}

function formatDuracion(seg: number): string {
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  if (h === 0 && m === 0) return '< 1 min'
  if (h === 0) return `${m} min`
  return `${h}h ${m}min`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatUltimaConexion(iso: string | null): string {
  if (!iso) return 'Nunca'
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'Justo ahora'
  if (min < 60) return `Hace ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `Hace ${horas}h`
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export default function UsoEquipoTab() {
  const supabase = createClient()
  const [usuarios, setUsuarios] = useState<UsoUsuario[]>([])
  const [esVistaEquipo, setEsVistaEquipo] = useState(false)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/admin/equipo/uso')
    if (!r.ok) { setLoading(false); return }
    const result = await r.json()
    setUsuarios(result.usuarios ?? [])
    setEsVistaEquipo(!!result.esVistaEquipo)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Refresca la lista sola cuando cambia la presencia de cualquiera del equipo
  // (en vivo, tipo WhatsApp Web) + un polling de respaldo cada 20s.
  useEffect(() => {
    const ch = supabase
      .channel('equipo-presencia')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios_presencia' }, () => cargar())
      .subscribe()
    const t = setInterval(cargar, 20_000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [cargar, supabase])

  if (loading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl h-24 animate-pulse border border-gray-100" />)}</div>
  }

  return (
    <div className="space-y-3">
      {esVistaEquipo && (
        <p className="text-xs text-gray-400 px-1">Uso de OptiDesk de todo el equipo — solo gerencia y dueño ven esto de los demás.</p>
      )}
      {usuarios.map(u => {
        const p = PRESENCIA_INFO[u.presencia]
        return (
          <div key={u.id} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${p.dot} ${u.presencia === 'activo' ? 'animate-pulse' : ''}`} />
                  <p className="text-sm font-semibold text-gray-800">{u.nombre}</p>
                  <span className={`text-[10px] font-medium ${p.text}`}>{p.label}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">{u.email}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-gray-400">Última conexión</p>
                <p className="text-xs font-medium text-gray-600">{formatUltimaConexion(u.ultima_conexion)}</p>
              </div>
            </div>

            {u.presencia !== 'cerrado' && u.pagina_actual && (
              <p className="text-[11px] text-indigo-500 mt-2">📍 Viendo: {u.pagina_actual}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-400">Activo hoy</p>
                <p className="text-sm font-bold text-gray-800">{formatDuracion(u.tiempo_activo_hoy_seg)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-400">Activo (7 días)</p>
                <p className="text-sm font-bold text-gray-800">{formatDuracion(u.tiempo_activo_semana_seg)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-400">Acciones (7 días)</p>
                <p className="text-sm font-bold text-gray-800">{u.acciones_semana}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-400">Almacenamiento</p>
                <p className="text-sm font-bold text-gray-800">{formatBytes(u.almacenamiento_bytes)}</p>
              </div>
            </div>

            {u.paginas_frecuentes.length > 0 && (
              <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                <span className="text-[10px] text-gray-400">Usa más:</span>
                {u.paginas_frecuentes.map(s => (
                  <span key={s} className="text-[10px] bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">{s}</span>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {usuarios.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">Todavía no hay datos de uso registrados.</p>
      )}
    </div>
  )
}
