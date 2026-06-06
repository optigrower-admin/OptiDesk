'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

type Periodo = 'hoy' | 'semana' | 'mes'

interface Stats {
  falta_revision: number
  en_proceso: number
  pendiente: number
  listo: number
  total: number
}

function getDesde(periodo: Periodo): string {
  const ahora = new Date()
  if (periodo === 'hoy') {
    ahora.setHours(0, 0, 0, 0)
  } else if (periodo === 'semana') {
    const dia = ahora.getDay()
    ahora.setDate(ahora.getDate() - (dia === 0 ? 6 : dia - 1))
    ahora.setHours(0, 0, 0, 0)
  } else {
    ahora.setDate(1)
    ahora.setHours(0, 0, 0, 0)
  }
  return ahora.toISOString()
}

export default function PerfilMecanicoPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [stats, setStats] = useState<Stats>({ falta_revision: 0, en_proceso: 0, pendiente: 0, listo: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.tenant_id || !profile?.id) return
    setLoading(true)
    const desde = getDesde(periodo)
    supabase
      .from('ordenes')
      .select('estado')
      .eq('tenant_id', profile.tenant_id)
      .eq('mecanico_id', profile.id)
      .gte('created_at', desde)
      .then(({ data }) => {
        const rows = data ?? []
        const s: Stats = { falta_revision: 0, en_proceso: 0, pendiente: 0, listo: 0, total: rows.length }
        for (const r of rows) {
          if (r.estado in s) s[r.estado as keyof Stats] = (s[r.estado as keyof Stats] as number) + 1
        }
        setStats(s)
        setLoading(false)
      })
  }, [profile?.tenant_id, profile?.id, periodo])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const periodos: { value: Periodo; label: string }[] = [
    { value: 'hoy', label: 'Hoy' },
    { value: 'semana', label: 'Esta semana' },
    { value: 'mes', label: 'Este mes' },
  ]

  const cards = [
    { label: 'Falta revisión', value: stats.falta_revision, color: 'bg-red-50 border-red-200 text-red-700' },
    { label: 'En proceso', value: stats.en_proceso, color: 'bg-blue-50 border-blue-200 text-blue-700' },
    { label: 'Pendiente', value: stats.pendiente, color: 'bg-amber-50 border-amber-200 text-amber-700' },
    { label: 'Listas', value: stats.listo, color: 'bg-green-50 border-green-200 text-green-700' },
  ]

  return (
    <div className="p-4 space-y-5">
      {/* Info del perfil */}
      <div className="bg-blue-700 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold">
            {profile?.nombre?.[0] ?? '?'}
          </div>
          <div>
            <p className="font-bold text-lg leading-tight">{profile?.nombre ?? '...'}</p>
            <p className="text-blue-200 text-sm">Profesional Mecánica</p>
            <p className="text-blue-300 text-xs mt-0.5">{profile?.email}</p>
          </div>
        </div>
      </div>

      {/* Selector de período */}
      <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
        {periodos.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              periodo === p.value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Resumen */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">Mis motos</h2>
          {loading ? (
            <span className="text-xs text-gray-400">Cargando...</span>
          ) : (
            <span className="text-xs text-gray-500">{stats.total} en total</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.label} className={`border rounded-xl p-4 ${c.color}`}>
              <p className="text-2xl font-bold">{loading ? '—' : c.value}</p>
              <p className="text-xs font-medium mt-1 opacity-80">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Progreso del día */}
      {!loading && stats.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Progreso</p>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${Math.round((stats.listo / stats.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            {stats.listo} de {stats.total} motos listas ({Math.round((stats.listo / stats.total) * 100)}%)
          </p>
        </div>
      )}

      {/* Cerrar sesión */}
      <button
        onClick={handleLogout}
        className="w-full py-3 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
