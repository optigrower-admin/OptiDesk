'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBytes } from '@/lib/utils'

interface TenantStat {
  id: string
  nombre: string
  storageBytes: number
  usuarios: number
  ordenes: number
  medios: number
}

interface Counts {
  usuarios: number
  ordenes: number
  items: number
  medios: number
  repuestosUma: number
  repuestosExt: number
}

const R2_FREE_LIMIT = 10 * 1024 * 1024 * 1024
const SUPABASE_MAU_LIMIT = 50_000

function Bar({ pct }: { pct: number }) {
  const color = pct > 80 ? 'bg-red-500' : pct > 55 ? 'bg-amber-400' : 'bg-blue-500'
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function Limite({ label, valor, limite, pct, paidNote }: {
  label: string; valor?: string; limite: string; pct?: number; paidNote: string
}) {
  return (
    <div className="space-y-1 py-2 border-b border-gray-50 last:border-0">
      <div className="flex justify-between items-baseline">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">
          {valor && <span className="font-semibold text-gray-800 mr-1">{valor}</span>}
          / {limite} gratis
        </span>
      </div>
      {pct !== undefined && <Bar pct={pct} />}
      <p className="text-[10px] text-gray-400">{paidNote}</p>
    </div>
  )
}

export default function HerramientasPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [tenantStats, setTenantStats] = useState<TenantStat[]>([])
  const [counts, setCounts] = useState<Counts>({ usuarios: 0, ordenes: 0, items: 0, medios: 0, repuestosUma: 0, repuestosExt: 0 })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)

    const [
      { data: tenants },
      { count: cUsuarios },
      { count: cOrdenes },
      { count: cItems },
      { count: cMedios },
      { count: cRUma },
      { count: cRExt },
    ] = await Promise.all([
      supabase.from('tenants').select('id, nombre, storage_usado_bytes').eq('activo', true).order('nombre'),
      supabase.from('usuarios').select('id', { count: 'exact', head: true }),
      supabase.from('ordenes').select('id', { count: 'exact', head: true }),
      supabase.from('items_orden').select('id', { count: 'exact', head: true }),
      supabase.from('medios').select('id', { count: 'exact', head: true }),
      supabase.from('repuestos_uma').select('id', { count: 'exact', head: true }),
      supabase.from('repuestos_externos').select('id', { count: 'exact', head: true }),
    ])

    const ids = (tenants ?? []).map((t) => (t as { id: string }).id)

    const [{ data: usuarioRows }, { data: ordenRows }, { data: medioRows }] = await Promise.all([
      ids.length ? supabase.from('usuarios').select('tenant_id').in('tenant_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('ordenes').select('tenant_id').in('tenant_id', ids) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('medios').select('tenant_id').in('tenant_id', ids) : Promise.resolve({ data: [] }),
    ])

    const cnt = (arr: { tenant_id: string }[] | null, id: string) =>
      (arr ?? []).filter((r) => r.tenant_id === id).length

    const stats: TenantStat[] = (tenants ?? []).map((t) => {
      const ten = t as { id: string; nombre: string; storage_usado_bytes: number }
      return {
        id: ten.id,
        nombre: ten.nombre,
        storageBytes: ten.storage_usado_bytes ?? 0,
        usuarios: cnt(usuarioRows as { tenant_id: string }[], ten.id),
        ordenes: cnt(ordenRows as { tenant_id: string }[], ten.id),
        medios: cnt(medioRows as { tenant_id: string }[], ten.id),
      }
    })

    setTenantStats(stats)
    setCounts({
      usuarios: cUsuarios ?? 0, ordenes: cOrdenes ?? 0, items: cItems ?? 0,
      medios: cMedios ?? 0, repuestosUma: cRUma ?? 0, repuestosExt: cRExt ?? 0,
    })
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const totalStorage = tenantStats.reduce((s, t) => s + t.storageBytes, 0)
  const r2Pct = Math.round((totalStorage / R2_FREE_LIMIT) * 100)
  const mauPct = Math.round((counts.usuarios / SUPABASE_MAU_LIMIT) * 100)
  const totalRows = counts.usuarios + counts.ordenes + counts.items + counts.medios + counts.repuestosUma + counts.repuestosExt

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <div className="h-8 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="h-52 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Herramientas y costos</h1>
          <p className="text-sm text-gray-500 mt-1">Límites del plan gratuito, cuándo empieza a cobrarte y uso actual por empresa</p>
        </div>
        <div className="text-right">
          {lastUpdated && (
            <p className="text-xs text-gray-400">
              {lastUpdated.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </p>
          )}
          <button onClick={cargar} className="text-xs text-blue-600 hover:underline">Refrescar</button>
        </div>
      </div>

      {/* Service cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── Supabase ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-sm">SB</span>
              </div>
              <div>
                <p className="font-bold text-gray-900">Supabase</p>
                <p className="text-xs text-gray-400">Base de datos · Auth · API</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">Free</span>
              <a href="https://supabase.com/dashboard/account/billing" target="_blank" rel="noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 underline">Billing ↗</a>
            </div>
          </div>
          <div className="px-5 py-3 space-y-0.5">
            <Limite label="Usuarios activos / mes (MAU)"
              valor={counts.usuarios.toLocaleString('es-CO')} limite="50.000"
              pct={mauPct} paidNote="Pro $25 USD/mes → usuarios ilimitados" />
            <Limite label="Almacenamiento BD"
              valor={`≈ ${totalRows.toLocaleString('es-CO')} filas`} limite="500 MB"
              paidNote="Pro $25 USD/mes → 8 GB incluidos (+$0.125/GB extra)" />
            <Limite label="Proyectos gratuitos"
              valor={`${tenantStats.length > 0 ? 1 : 0} usado`} limite="2 proyectos"
              paidNote="Pro → ilimitados" />
            <Limite label="Storage de archivos (nativo)"
              valor="No usado" limite="1 GB"
              paidNote="Usamos Cloudflare R2 en su lugar — sin costo adicional aquí" />
          </div>
          <div className="px-5 pb-4">
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-700">
              <span className="font-semibold">Atención:</span> El plan Free pausa el proyecto si no hay actividad por <strong>7 días</strong>. Upgradar a Pro ($25/mes) para producción continua.
            </div>
          </div>
        </div>

        {/* ── Vercel ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-lg leading-none">▲</span>
              </div>
              <div>
                <p className="font-bold text-gray-900">Vercel</p>
                <p className="text-xs text-gray-400">Hosting · Deploy · CDN</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-gray-100 text-gray-700 font-semibold px-2.5 py-1 rounded-full">Hobby</span>
              <a href="https://vercel.com/account/billing" target="_blank" rel="noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 underline">Billing ↗</a>
            </div>
          </div>
          <div className="px-5 py-3 space-y-0.5">
            <Limite label="Bandwidth" valor="—" limite="100 GB/mes"
              paidNote="Pro $20 USD/mes/usuario → 1 TB incluido" />
            <Limite label="Ejecución funciones serverless" valor="—" limite="100 GB-horas/mes"
              paidNote="Pro → 1.000 GB-horas + $0.18/GB-hora extra" />
            <Limite label="Tiempo de build" valor="—" limite="6.000 min/mes"
              paidNote="Pro → 6.000 min incluidos + $0.70/hora extra" />
            <Limite label="Builds simultáneos" valor="1" limite="1"
              paidNote="Pro → 10 builds simultáneos" />
            <Limite label="Dominios custom" valor="Ilimitado" limite="Ilimitado"
              paidNote="Gratis en todos los planes" />
          </div>
          <div className="px-5 pb-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-xs text-blue-700">
              <span className="font-semibold">Nota:</span> Plan Hobby prohíbe uso comercial en producción. Para negocio real considera Pro ($20/mes).
            </div>
          </div>
        </div>

        {/* ── Cloudflare R2 ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-sm">CF</span>
              </div>
              <div>
                <p className="font-bold text-gray-900">Cloudflare R2</p>
                <p className="text-xs text-gray-400">Almacenamiento fotos y videos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${r2Pct > 80 ? 'bg-red-100 text-red-700' : r2Pct > 55 ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
                {r2Pct}% usado
              </span>
              <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 underline">Dashboard ↗</a>
            </div>
          </div>
          <div className="px-5 py-3 space-y-0.5">
            <Limite label="Almacenamiento total"
              valor={formatBytes(totalStorage)} limite="10 GB/mes"
              pct={r2Pct} paidNote="Pagado: $0.015 USD/GB/mes sobre 10 GB" />
            <Limite label="Operaciones escritura (PUT/DELETE)" valor="—" limite="1.000.000/mes"
              paidNote="Pagado: $4.50 USD por millón extra" />
            <Limite label="Operaciones lectura (GET)" valor="—" limite="10.000.000/mes"
              paidNote="Pagado: $0.36 USD por millón extra" />
            <Limite label="Transferencia saliente (egress)" valor="Ilimitada" limite="Siempre gratis"
              paidNote="R2 nunca cobra por tráfico saliente — ventaja vs S3" />
          </div>
          <div className="px-5 pb-4">
            <div className={`border rounded-xl px-3 py-2.5 text-xs ${r2Pct > 80 ? 'bg-red-50 border-red-100 text-red-700' : 'bg-green-50 border-green-100 text-green-700'}`}>
              {r2Pct > 80
                ? `⚠ Cerca del límite gratuito. Considera mover archivos a Drive o pagar por el exceso.`
                : `Uso actual: ${formatBytes(totalStorage)} de ${formatBytes(R2_FREE_LIMIT)} gratuitos. Sin costo por ahora.`}
            </div>
          </div>
        </div>

        {/* ── GitHub ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-gray-900">GitHub</p>
                <p className="text-xs text-gray-400">Código · Versiones · CI</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-gray-100 text-gray-700 font-semibold px-2.5 py-1 rounded-full">Free</span>
              <a href="https://github.com/settings/billing" target="_blank" rel="noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 underline">Billing ↗</a>
            </div>
          </div>
          <div className="px-5 py-3 space-y-0.5">
            <Limite label="Repositorios" valor="Ilimitado" limite="Ilimitado"
              paidNote="Gratis siempre, públicos y privados" />
            <Limite label="GitHub Actions (CI/CD)" valor="—" limite="2.000 min/mes"
              paidNote="Team $4 USD/usuario/mes → 3.000 min incluidos" />
            <Limite label="Packages storage" valor="—" limite="500 MB"
              paidNote="Pagado: $0.25 USD/GB extra" />
            <Limite label="Colaboradores (repos privados)" valor="Ilimitado" limite="Ilimitado"
              paidNote="Gratis en Free. Team/Enterprise para features avanzados" />
          </div>
          <div className="px-5 pb-4">
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs text-gray-600">
              Repositorio actual: <span className="font-semibold">optigrower-admin/OptiDesk</span>. Plan gratuito es suficiente para el uso actual.
            </div>
          </div>
        </div>

      </div>

      {/* Uso por empresa */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Uso por empresa</h2>
          <span className="text-xs text-gray-400">{tenantStats.length} empresa{tenantStats.length !== 1 ? 's' : ''} activa{tenantStats.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
                <th className="text-left py-3 px-5 font-medium">Empresa</th>
                <th className="text-center py-3 px-3 font-medium">Usuarios</th>
                <th className="text-center py-3 px-3 font-medium">Órdenes</th>
                <th className="text-center py-3 px-3 font-medium">Archivos</th>
                <th className="text-right py-3 px-4 font-medium">Storage R2</th>
                <th className="text-right py-3 px-5 font-medium">% del límite</th>
              </tr>
            </thead>
            <tbody>
              {tenantStats.map((t) => {
                const pct = Math.round((t.storageBytes / R2_FREE_LIMIT) * 100)
                return (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-5 font-semibold text-gray-900">{t.nombre}</td>
                    <td className="py-3 px-3 text-center text-gray-700">{t.usuarios}</td>
                    <td className="py-3 px-3 text-center text-gray-700">{t.ordenes.toLocaleString('es-CO')}</td>
                    <td className="py-3 px-3 text-center text-gray-700">{t.medios}</td>
                    <td className="py-3 px-4 text-right text-gray-700 font-mono text-xs">{formatBytes(t.storageBytes)}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-20">
                          <Bar pct={pct} />
                        </div>
                        <span className={`text-xs font-semibold w-8 text-right ${pct > 80 ? 'text-red-600' : pct > 55 ? 'text-amber-600' : 'text-gray-600'}`}>
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {tenantStats.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">Sin empresas activas</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t">
                <td className="py-3 px-5 text-xs font-bold text-gray-700">TOTAL</td>
                <td className="py-3 px-3 text-center text-xs font-bold text-gray-700">{counts.usuarios}</td>
                <td className="py-3 px-3 text-center text-xs font-bold text-gray-700">{counts.ordenes.toLocaleString('es-CO')}</td>
                <td className="py-3 px-3 text-center text-xs font-bold text-gray-700">{counts.medios}</td>
                <td className="py-3 px-4 text-right text-xs font-bold text-gray-700 font-mono">{formatBytes(totalStorage)}</td>
                <td className="py-3 px-5 text-right text-xs font-bold text-gray-700">{r2Pct}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Resumen filas en BD */}
        <div className="mt-4 bg-gray-50 border border-gray-100 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">Registros en base de datos (Supabase) — total: {totalRows.toLocaleString('es-CO')} filas</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Usuarios', value: counts.usuarios },
              { label: 'Órdenes', value: counts.ordenes },
              { label: 'Ítems de orden', value: counts.items },
              { label: 'Archivos (medios)', value: counts.medios },
              { label: 'Repuestos UMA', value: counts.repuestosUma },
              { label: 'Repuestos externos', value: counts.repuestosExt },
            ].map((r) => (
              <div key={r.label} className="bg-white rounded-lg px-3 py-2.5 border border-gray-100">
                <p className="text-lg font-bold text-gray-900">{r.value.toLocaleString('es-CO')}</p>
                <p className="text-xs text-gray-500">{r.label}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">
            Supabase Free incluye 500 MB de almacenamiento en BD. Con ~{totalRows.toLocaleString('es-CO')} filas estás muy por debajo del límite.
          </p>
        </div>
      </div>

    </div>
  )
}
