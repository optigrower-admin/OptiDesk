'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { formatCOP } from '@/lib/utils'
import { PerfilExtras } from '@/components/PerfilExtras'

type Periodo = 'hoy' | 'semana' | 'mes'

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

interface EstadoStats {
  falta_revision: number
  en_proceso: number
  pendiente: number
  listo: number
  total: number
  facturado: number
}

interface MecanicoStat {
  nombre: string
  total: number
  listo: number
}

export default function AdminPerfilPage() {
  const { profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [stats, setStats] = useState<EstadoStats>({ falta_revision: 0, en_proceso: 0, pendiente: 0, listo: 0, total: 0, facturado: 0 })
  const [mecanicos, setMecanicos] = useState<MecanicoStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const desde = getDesde(periodo)

    supabase
      .from('ordenes')
      .select('estado, valor_total, usuarios:mecanico_id(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .gte('created_at', desde)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as { estado: string; valor_total: number; usuarios: { nombre: string } | null }[]
        const s: EstadoStats = { falta_revision: 0, en_proceso: 0, pendiente: 0, listo: 0, total: rows.length, facturado: 0 }
        const mecMap = new Map<string, { total: number; listo: number }>()

        for (const r of rows) {
          if (r.estado === 'falta_revision') s.falta_revision++
          else if (r.estado === 'en_proceso') s.en_proceso++
          else if (r.estado === 'pendiente') s.pendiente++
          else if (r.estado === 'listo') { s.listo++; s.facturado += r.valor_total ?? 0 }

          const nombre = r.usuarios?.nombre ?? 'Sin asignar'
          if (!mecMap.has(nombre)) mecMap.set(nombre, { total: 0, listo: 0 })
          const m = mecMap.get(nombre)!
          m.total++
          if (r.estado === 'listo') m.listo++
        }

        setStats(s)
        setMecanicos(
          Array.from(mecMap.entries())
            .map(([nombre, v]) => ({ nombre, ...v }))
            .sort((a, b) => b.total - a.total)
        )
        setLoading(false)
      })
  }, [profile?.tenant_id, periodo])

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
    { label: 'Cerradas', value: stats.listo, color: 'bg-green-50 border-green-200 text-green-700' },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Perfil */}
      <div className="bg-blue-700 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-2xl font-bold">
            {profile?.nombre?.[0] ?? '?'}
          </div>
          <div>
            <p className="font-bold text-xl leading-tight">{profile?.nombre ?? '...'}</p>
            <p className="text-blue-200 text-sm">
              {profile?.rol === 'gerencia' ? 'Gerencia' : 'Administrador Área'}
            </p>
            <p className="text-blue-300 text-xs mt-0.5">{profile?.email}</p>
          </div>
        </div>
      </div>

      {/* Período */}
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

      {/* Facturado */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-5">
        <p className="text-sm text-green-700 font-medium mb-1">Facturado ({periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes'})</p>
        <p className="text-3xl font-bold text-green-800">{loading ? '—' : formatCOP(stats.facturado)}</p>
        <p className="text-xs text-green-600 mt-1">
          {loading ? '' : `${stats.listo} orden${stats.listo !== 1 ? 'es' : ''} cerrada${stats.listo !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Estado del taller */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">Estado del taller</h2>
          {!loading && <span className="text-xs text-gray-500">{stats.total} órdenes en total</span>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => (
            <div key={c.label} className={`border rounded-xl p-4 ${c.color}`}>
              <p className="text-2xl font-bold">{loading ? '—' : c.value}</p>
              <p className="text-xs font-medium mt-1 opacity-80">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Progreso */}
      {!loading && stats.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
            <span>Progreso general</span>
            <span>{Math.round((stats.listo / stats.total) * 100)}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${Math.round((stats.listo / stats.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1.5">{stats.listo} de {stats.total} órdenes cerradas</p>
        </div>
      )}

      {/* Por profesional */}
      {!loading && mecanicos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Por profesional</h2>
          <div className="space-y-4">
            {mecanicos.map((m) => (
              <div key={m.nombre} className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                  {m.nombre[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-800 truncate">{m.nombre}</span>
                    <span className="text-gray-500 flex-shrink-0 ml-2">{m.listo}/{m.total} cerradas</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: m.total > 0 ? `${Math.round((m.listo / m.total) * 100)}%` : '0%' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fotos, videos y notas del perfil */}
      {profile?.id && profile?.tenant_id && (
        <PerfilExtras
          usuarioId={profile.id}
          tenantId={profile.tenant_id}
          currentUserId={profile.id}
          currentUserRol={profile.rol ?? ''}
          currentUserEmail={profile.email ?? ''}
        />
      )}

      <button
        onClick={handleLogout}
        className="w-full py-3 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
      >
        Cerrar sesión
      </button>
    </div>
  )
}
