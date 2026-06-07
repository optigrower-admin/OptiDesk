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
  pagosOrden: number
  auditoria: number
  tenants: number
}

const R2_FREE_LIMIT   = 10 * 1024 * 1024 * 1024   // 10 GB
const SB_MAU_LIMIT    = 50_000
const SB_DB_LIMIT     = 500 * 1024 * 1024          // 500 MB

// Peso promedio por fila en bytes (estimado por tabla)
const ROW_WEIGHTS: Record<keyof Omit<Counts, 'tenants'>, number> = {
  ordenes:      1_800,
  items:          380,
  usuarios:       460,
  medios:         320,
  repuestosUma:   720,
  repuestosExt:   450,
  pagosOrden:     290,
  auditoria:      600,
}

function estimateDbBytes(c: Counts): number {
  const base = Object.entries(ROW_WEIGHTS).reduce((s, [k, w]) => s + (c[k as keyof typeof ROW_WEIGHTS] ?? 0) * w, 0)
  return Math.round(base * 1.35) // +35% para índices y overhead
}

function Bar({ pct }: { pct: number }) {
  const color = pct > 80 ? 'bg-red-500' : pct > 55 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function BarBlue({ pct }: { pct: number }) {
  const color = pct > 80 ? 'bg-red-500' : pct > 55 ? 'bg-amber-400' : 'bg-blue-500'
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function Limite({ label, valor, limite, pct, currentLabel, paidNote }: {
  label: string; valor?: string; limite: string; pct?: number; currentLabel?: string; paidNote: string
}) {
  return (
    <div className="space-y-1 py-2 border-b border-gray-50 last:border-0">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-xs font-medium text-gray-700 flex-1">{label}</span>
        <span className="text-xs text-gray-400 flex-shrink-0">
          {valor && <span className="font-semibold text-gray-800 mr-1">{valor}</span>}
          / {limite}
        </span>
      </div>
      {pct !== undefined && (
        <>
          <Bar pct={pct} />
          {currentLabel && (
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>{currentLabel}</span>
              <span className={pct > 80 ? 'text-red-500 font-semibold' : ''}>{pct}% usado</span>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-gray-400 mt-0.5">{paidNote}</p>
    </div>
  )
}

function LimiteR2({ label, valor, limite, pct, currentLabel, paidNote }: {
  label: string; valor?: string; limite: string; pct?: number; currentLabel?: string; paidNote: string
}) {
  return (
    <div className="space-y-1 py-2 border-b border-gray-50 last:border-0">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-xs font-medium text-gray-700 flex-1">{label}</span>
        <span className="text-xs text-gray-400 flex-shrink-0">
          {valor && <span className="font-semibold text-gray-800 mr-1">{valor}</span>}
          / {limite}
        </span>
      </div>
      {pct !== undefined && (
        <>
          <BarBlue pct={pct} />
          {currentLabel && (
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>{currentLabel}</span>
              <span className={pct > 80 ? 'text-red-500 font-semibold' : ''}>{pct}% usado</span>
            </div>
          )}
        </>
      )}
      <p className="text-[10px] text-gray-400 mt-0.5">{paidNote}</p>
    </div>
  )
}

// ─── Acceso rápido ────────────────────────────────────────────────────────────
const ACCESOS = [
  {
    group: 'Supabase',
    color: 'emerald',
    items: [
      { label: 'Dashboard principal', url: 'https://supabase.com/dashboard', desc: 'Vista general del proyecto' },
      { label: 'Editor de tablas', url: 'https://supabase.com/dashboard/project/_/editor', desc: 'Ver y editar datos directamente' },
      { label: 'Editor SQL', url: 'https://supabase.com/dashboard/project/_/sql/new', desc: 'Ejecutar consultas SQL' },
      { label: 'Autenticación / Usuarios', url: 'https://supabase.com/dashboard/project/_/auth/users', desc: 'Gestionar usuarios auth' },
      { label: 'Storage nativo', url: 'https://supabase.com/dashboard/project/_/storage/buckets', desc: 'Buckets de almacenamiento' },
      { label: 'Logs en tiempo real', url: 'https://supabase.com/dashboard/project/_/logs/edge-logs', desc: 'Logs de peticiones y errores' },
      { label: 'Billing Supabase', url: 'https://supabase.com/dashboard/account/billing', desc: 'Facturas y plan' },
    ],
  },
  {
    group: 'Vercel',
    color: 'gray',
    items: [
      { label: 'Dashboard Vercel', url: 'https://vercel.com/dashboard', desc: 'Todos los proyectos' },
      { label: 'Proyecto OptiDesk', url: 'https://vercel.com/optigrower-admin', desc: 'Deployments y configuración' },
      { label: 'Variables de entorno', url: 'https://vercel.com/optigrower-admin/optidesk/settings/environment-variables', desc: 'Secrets y variables' },
      { label: 'Analytics', url: 'https://vercel.com/optigrower-admin/optidesk/analytics', desc: 'Tráfico y performance' },
      { label: 'Billing Vercel', url: 'https://vercel.com/account/billing', desc: 'Facturas y plan' },
    ],
  },
  {
    group: 'Cloudflare',
    color: 'orange',
    items: [
      { label: 'Dashboard Cloudflare', url: 'https://dash.cloudflare.com', desc: 'Vista general de la cuenta' },
      { label: 'R2 — Buckets', url: 'https://dash.cloudflare.com/?to=/:account/r2/overview', desc: 'Almacenamiento de archivos' },
      { label: 'R2 — Uso y métricas', url: 'https://dash.cloudflare.com/?to=/:account/r2/usage', desc: 'Consumo vs límite gratuito' },
      { label: 'Billing Cloudflare', url: 'https://dash.cloudflare.com/?to=/:account/billing', desc: 'Facturas y plan' },
    ],
  },
  {
    group: 'GitHub',
    color: 'slate',
    items: [
      { label: 'Repositorio OptiDesk', url: 'https://github.com/optigrower-admin/OptiDesk', desc: 'Código fuente' },
      { label: 'Commits recientes', url: 'https://github.com/optigrower-admin/OptiDesk/commits/main', desc: 'Historial de cambios' },
      { label: 'Actions (CI/CD)', url: 'https://github.com/optigrower-admin/OptiDesk/actions', desc: 'Pipelines y minutos usados' },
      { label: 'Billing GitHub', url: 'https://github.com/settings/billing', desc: 'Facturas y plan' },
    ],
  },
]

const colorMap: Record<string, { dot: string; badge: string; link: string }> = {
  emerald: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700', link: 'hover:bg-emerald-50 hover:text-emerald-700' },
  gray:    { dot: 'bg-gray-800',    badge: 'bg-gray-100 text-gray-700',      link: 'hover:bg-gray-100 hover:text-gray-900' },
  orange:  { dot: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700',   link: 'hover:bg-orange-50 hover:text-orange-700' },
  slate:   { dot: 'bg-slate-700',   badge: 'bg-slate-50 text-slate-700',     link: 'hover:bg-slate-100 hover:text-slate-900' },
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function HerramientasPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [tenantStats, setTenantStats] = useState<TenantStat[]>([])
  const [counts, setCounts] = useState<Counts>({
    usuarios: 0, ordenes: 0, items: 0, medios: 0,
    repuestosUma: 0, repuestosExt: 0, pagosOrden: 0, auditoria: 0, tenants: 0,
  })
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
      { count: cPagos },
      { count: cAudit },
    ] = await Promise.all([
      supabase.from('tenants').select('id, nombre, storage_usado_bytes').eq('activo', true).order('nombre'),
      supabase.from('usuarios').select('id', { count: 'exact', head: true }),
      supabase.from('ordenes').select('id', { count: 'exact', head: true }),
      supabase.from('items_orden').select('id', { count: 'exact', head: true }),
      supabase.from('medios').select('id', { count: 'exact', head: true }),
      supabase.from('repuestos_uma').select('id', { count: 'exact', head: true }),
      supabase.from('repuestos_externos').select('id', { count: 'exact', head: true }),
      supabase.from('pagos_orden').select('id', { count: 'exact', head: true }),
      supabase.from('auditoria').select('id', { count: 'exact', head: true }),
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
        id: ten.id, nombre: ten.nombre,
        storageBytes: ten.storage_usado_bytes ?? 0,
        usuarios: cnt(usuarioRows as { tenant_id: string }[], ten.id),
        ordenes: cnt(ordenRows as { tenant_id: string }[], ten.id),
        medios: cnt(medioRows as { tenant_id: string }[], ten.id),
      }
    })

    const newCounts: Counts = {
      usuarios: cUsuarios ?? 0, ordenes: cOrdenes ?? 0, items: cItems ?? 0,
      medios: cMedios ?? 0, repuestosUma: cRUma ?? 0, repuestosExt: cRExt ?? 0,
      pagosOrden: cPagos ?? 0, auditoria: cAudit ?? 0, tenants: (tenants ?? []).length,
    }

    setTenantStats(stats)
    setCounts(newCounts)
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const totalStorage  = tenantStats.reduce((s, t) => s + t.storageBytes, 0)
  const r2Pct         = Math.round((totalStorage / R2_FREE_LIMIT) * 100)
  const mauPct        = Math.round((counts.usuarios / SB_MAU_LIMIT) * 100)
  const dbEstBytes    = estimateDbBytes(counts)
  const dbPct         = Math.round((dbEstBytes / SB_DB_LIMIT) * 100)
  const totalRows     = counts.usuarios + counts.ordenes + counts.items + counts.medios +
                        counts.repuestosUma + counts.repuestosExt + counts.pagosOrden + counts.auditoria

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <div className="h-8 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((k) => <div key={k} className="h-52 bg-gray-100 rounded-2xl animate-pulse" />)}
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
          {lastUpdated && <p className="text-xs text-gray-400">{lastUpdated.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>}
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
            <Limite label="Almacenamiento BD"
              valor={`~${formatBytes(dbEstBytes)}`} limite="500 MB"
              pct={dbPct}
              currentLabel={`~${formatBytes(dbEstBytes)} estimados (${totalRows.toLocaleString('es-CO')} filas × peso promedio)`}
              paidNote="Pro $25 USD/mes → 8 GB incluidos (+$0.125/GB extra)" />
            <Limite label="Usuarios activos / mes (MAU)"
              valor={counts.usuarios.toLocaleString('es-CO')} limite="50.000"
              pct={mauPct}
              currentLabel={`${counts.usuarios.toLocaleString('es-CO')} usuarios registrados`}
              paidNote="Pro $25 USD/mes → usuarios ilimitados" />
            <Limite label="Proyectos gratuitos"
              valor={`1 de 2 usados`} limite="2 proyectos"
              paidNote="Pro → proyectos ilimitados" />
            <Limite label="Storage nativo de archivos"
              valor="No usado" limite="1 GB"
              paidNote="Usamos Cloudflare R2 — no consume esta cuota" />
          </div>
          <div className="px-5 pb-4">
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-xs text-amber-700">
              <span className="font-semibold">Atención:</span> Plan Free pausa el proyecto si no hay actividad por <strong>7 días</strong>. Pro ($25/mes) elimina la pausa.
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
              paidNote="Pro → 1.000 GB-horas (+$0.18/GB-hora extra)" />
            <Limite label="Tiempo de build" valor="—" limite="6.000 min/mes"
              paidNote="Pro → 6.000 min incluidos (+$0.70/hora extra)" />
            <Limite label="Builds simultáneos" valor="1 activo" limite="1"
              paidNote="Pro → 10 builds en paralelo" />
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
            <LimiteR2 label="Almacenamiento total"
              valor={formatBytes(totalStorage)} limite="10 GB/mes"
              pct={r2Pct}
              currentLabel={`${formatBytes(totalStorage)} entre todas las empresas`}
              paidNote="Pagado: $0.015 USD/GB/mes sobre los 10 GB gratuitos" />
            <LimiteR2 label="Ops escritura (PUT / DELETE)" valor="—" limite="1.000.000/mes"
              paidNote="Pagado: $4.50 USD por millón extra" />
            <LimiteR2 label="Ops lectura (GET / HEAD)" valor="—" limite="10.000.000/mes"
              paidNote="Pagado: $0.36 USD por millón extra" />
            <LimiteR2 label="Transferencia saliente (egress)" valor="Ilimitada" limite="Siempre gratis"
              paidNote="R2 nunca cobra por tráfico saliente — ventaja vs S3 y GCS" />
          </div>
          <div className="px-5 pb-4">
            <div className={`border rounded-xl px-3 py-2.5 text-xs ${r2Pct > 80 ? 'bg-red-50 border-red-100 text-red-700' : 'bg-green-50 border-green-100 text-green-700'}`}>
              {r2Pct > 80
                ? `⚠ Cerca del límite. Usa la página Storage para mover archivos a Drive y liberar espacio.`
                : `Sin costo por ahora. Quedan ${formatBytes(R2_FREE_LIMIT - totalStorage)} disponibles del tier gratuito.`}
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
                <p className="text-xs text-gray-400">Código · Versiones · CI/CD</p>
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
            <Limite label="Colaboradores" valor="Ilimitado" limite="Ilimitado"
              paidNote="Gratis en Free para todos los repos" />
          </div>
          <div className="px-5 pb-4">
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-xs text-gray-600">
              Repositorio: <span className="font-semibold">optigrower-admin/OptiDesk</span>. Plan gratuito es suficiente para el uso actual.
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
                <th className="text-right py-3 px-4 font-medium">R2 Storage</th>
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
                    <td className="py-3 px-4 text-right font-mono text-xs text-gray-700">{formatBytes(t.storageBytes)}</td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-20">
                          <BarBlue pct={pct} />
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
                <td className="py-3 px-4 text-right text-xs font-bold font-mono text-gray-700">{formatBytes(totalStorage)}</td>
                <td className="py-3 px-5 text-right text-xs font-bold text-gray-700">{r2Pct}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Detalle filas BD */}
        <div className="mt-4 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-700">
              Registros en Supabase — {totalRows.toLocaleString('es-CO')} filas · BD estimada ~{formatBytes(dbEstBytes)}
            </p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dbPct > 80 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {dbPct}% de 500 MB
            </span>
          </div>
          <div className="mb-3"><Bar pct={dbPct} /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {[
              { label: 'Órdenes', value: counts.ordenes },
              { label: 'Ítems de orden', value: counts.items },
              { label: 'Rep. UMA', value: counts.repuestosUma },
              { label: 'Rep. Externos', value: counts.repuestosExt },
              { label: 'Usuarios', value: counts.usuarios },
              { label: 'Medios', value: counts.medios },
              { label: 'Pagos', value: counts.pagosOrden },
              { label: 'Auditoría', value: counts.auditoria },
            ].map((r) => (
              <div key={r.label} className="bg-white rounded-xl px-3 py-2.5 border border-gray-100">
                <p className="text-base font-bold text-gray-900">{r.value.toLocaleString('es-CO')}</p>
                <p className="text-[10px] text-gray-500">{r.label}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-3">
            * Estimación basada en peso promedio por tabla + 35% de overhead (índices). El valor real puede consultarse en Supabase → Dashboard → Settings → Database.
          </p>
        </div>
      </div>

      {/* Acceso rápido a plataformas */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Acceso rápido a plataformas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {ACCESOS.map((group) => {
            const c = colorMap[group.color]
            return (
              <div key={group.group} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
                  <p className="font-bold text-gray-900 text-sm">{group.group}</p>
                </div>
                <div className="p-3 space-y-1">
                  {group.items.map((item) => (
                    <a key={item.url} href={item.url} target="_blank" rel="noreferrer"
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors group ${c.link}`}
                    >
                      <div>
                        <p className="text-xs font-semibold text-gray-800 group-hover:text-inherit">{item.label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                      </div>
                      <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-inherit flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
