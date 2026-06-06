'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, formatBytes } from '@/lib/utils'

type Periodo = 'hoy' | 'semana' | 'mes'

function getDesde(periodo: Periodo): string {
  const ahora = new Date()
  if (periodo === 'hoy') { ahora.setHours(0, 0, 0, 0) }
  else if (periodo === 'semana') {
    const dia = ahora.getDay()
    ahora.setDate(ahora.getDate() - (dia === 0 ? 6 : dia - 1))
    ahora.setHours(0, 0, 0, 0)
  } else {
    ahora.setDate(1)
    ahora.setHours(0, 0, 0, 0)
  }
  return ahora.toISOString()
}

interface TenantStats {
  id: string
  nombre: string
  slug: string
  activo: boolean
  storage_usado_bytes: number
  nombre_herramienta: string | null
  total_ordenes: number
  listo: number
  en_proceso: number
  falta_revision: number
  pendiente: number
  facturado: number
  mecanicos: number
  admins: number
}

export default function GerenciaDashboardPage() {
  const supabase = createClient()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [tenants, setTenants] = useState<TenantStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const desde = getDesde(periodo)
    setLoading(true)

    Promise.all([
      supabase.from('tenants').select('id, nombre, slug, activo, storage_usado_bytes, nombre_herramienta').order('nombre'),
      supabase.from('ordenes').select('tenant_id, estado, valor_total').gte('created_at', desde),
      supabase.from('usuarios').select('id, tenant_id, rol').eq('activo', true),
    ]).then(([{ data: ts }, { data: os }, { data: us }]) => {
      const tenantsData = (ts ?? []) as Pick<TenantStats, 'id' | 'nombre' | 'slug' | 'activo' | 'storage_usado_bytes' | 'nombre_herramienta'>[]
      const ordenesData = (os ?? []) as { tenant_id: string; estado: string; valor_total: number }[]
      const usuariosData = (us ?? []) as { id: string; tenant_id: string; rol: string }[]

      const statsMap = new Map<string, TenantStats>()
      for (const t of tenantsData) {
        statsMap.set(t.id, {
          ...t,
          total_ordenes: 0, listo: 0, en_proceso: 0, falta_revision: 0, pendiente: 0, facturado: 0,
          mecanicos: usuariosData.filter((u) => u.tenant_id === t.id && u.rol === 'mecanico').length,
          admins: usuariosData.filter((u) => u.tenant_id === t.id && u.rol === 'admin').length,
        })
      }

      for (const o of ordenesData) {
        const s = statsMap.get(o.tenant_id)
        if (!s) continue
        s.total_ordenes++
        if (o.estado === 'listo') { s.listo++; s.facturado += o.valor_total ?? 0 }
        else if (o.estado === 'en_proceso') s.en_proceso++
        else if (o.estado === 'falta_revision') s.falta_revision++
        else if (o.estado === 'pendiente') s.pendiente++
      }

      setTenants(Array.from(statsMap.values()).sort((a, b) => b.total_ordenes - a.total_ordenes))
      setLoading(false)
    })
  }, [periodo])

  // ─── Métricas globales ───
  const totalEmpresas = tenants.filter((t) => t.activo).length
  const totalProfesionales = tenants.reduce((s, t) => s + t.mecanicos + t.admins, 0)
  const totalFacturado = tenants.reduce((s, t) => s + t.facturado, 0)
  const totalStorage = tenants.reduce((s, t) => s + t.storage_usado_bytes, 0)
  const ordenesActivas = tenants.reduce((s, t) => s + t.en_proceso + t.falta_revision + t.pendiente, 0)

  const periodos: { value: Periodo; label: string }[] = [
    { value: 'hoy', label: 'Hoy' },
    { value: 'semana', label: 'Esta semana' },
    { value: 'mes', label: 'Este mes' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel Control Total</h1>
          <p className="text-sm text-gray-500">Vista global de todas las empresas</p>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          {periodos.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                periodo === p.value ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Métricas plataforma */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Empresas activas', value: loading ? '—' : String(totalEmpresas), icon: '🏢', color: 'bg-purple-50 border-purple-200 text-purple-800' },
          { label: 'Profesionales activos', value: loading ? '—' : String(totalProfesionales), icon: '👥', color: 'bg-blue-50 border-blue-200 text-blue-800' },
          { label: 'Órdenes activas', value: loading ? '—' : String(ordenesActivas), icon: '⚙️', color: 'bg-amber-50 border-amber-200 text-amber-800' },
          { label: 'Órdenes cerradas', value: loading ? '—' : String(tenants.reduce((s, t) => s + t.listo, 0)), icon: '✅', color: 'bg-green-50 border-green-200 text-green-800' },
          { label: 'Facturado total', value: loading ? '—' : formatCOP(totalFacturado), icon: '💰', color: 'bg-green-50 border-green-200 text-green-800' },
          { label: 'Storage usado', value: loading ? '—' : formatBytes(totalStorage), icon: '💾', color: 'bg-gray-50 border-gray-200 text-gray-800' },
        ].map((m) => (
          <div key={m.label} className={`border rounded-xl p-4 ${m.color}`}>
            <div className="flex items-start justify-between mb-1">
              <span className="text-xl">{m.icon}</span>
            </div>
            <p className="text-xl font-bold">{m.value}</p>
            <p className="text-xs opacity-70 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Por empresa */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Por taller ({periodo === 'hoy' ? 'hoy' : periodo === 'semana' ? 'esta semana' : 'este mes'})</h2>
        <div className="space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-5 border border-gray-100 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-40 mb-3" />
                <div className="grid grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((j) => <div key={j} className="h-12 bg-gray-100 rounded-lg" />)}
                </div>
              </div>
            ))
          ) : tenants.length === 0 ? (
            <p className="text-center py-12 text-gray-400">Sin talleres registrados</p>
          ) : (
            tenants.map((t) => (
              <div key={t.id} className={`bg-white rounded-xl border p-5 ${!t.activo ? 'opacity-50 border-gray-100' : 'border-gray-200'}`}>
                {/* Header taller */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-700 font-bold">
                      {t.nombre[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{t.nombre}</p>
                        {t.nombre_herramienta && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{t.nombre_herramienta}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        <span>{t.mecanicos} mec.</span>
                        <span>·</span>
                        <span>{t.admins} adm.</span>
                        <span>·</span>
                        <span>{formatBytes(t.storage_usado_bytes)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-700">{formatCOP(t.facturado)}</p>
                    <p className="text-xs text-gray-400">{t.listo} cerrada{t.listo !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Mini stats */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Falta rev.', value: t.falta_revision, color: 'text-red-700 bg-red-50' },
                    { label: 'En proceso', value: t.en_proceso, color: 'text-blue-700 bg-blue-50' },
                    { label: 'Pendiente', value: t.pendiente, color: 'text-amber-700 bg-amber-50' },
                    { label: 'Cerradas', value: t.listo, color: 'text-green-700 bg-green-50' },
                  ].map((s) => (
                    <div key={s.label} className={`rounded-lg p-2.5 text-center ${s.color}`}>
                      <p className="text-lg font-bold">{s.value}</p>
                      <p className="text-xs opacity-75">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Barra */}
                {t.total_ordenes > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.round((t.listo / t.total_ordenes) * 100)}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{Math.round((t.listo / t.total_ordenes) * 100)}% completado · {t.total_ordenes} totales</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
