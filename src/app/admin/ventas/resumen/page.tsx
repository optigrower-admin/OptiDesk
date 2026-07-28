'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { EtapaVenta } from '@/lib/ventas/pipeline'
import { ETAPAS_NECESITAN_PLACA } from '@/lib/ventas/pipeline'
import VistaResumen from '../components/VistaResumen'
import type { LeadData } from '../components/LeadCard'
import { PeriodoFilter } from '@/components/dashboard/PeriodoFilter'
import { calcularRango, ymdLocal, type PeriodoPreset } from '@/lib/dashboard/periodos'

// ─── Filtro desplegable (mismo patrón que Dashboard Servicio Técnico) ──────────
function FilterDropdown({ title, badge, children }: { title: string; badge?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
          open ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {title}
          {(badge ?? 0) > 0 && (
            <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>
          )}
        </span>
        <svg className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[70] mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl p-3">
          {children}
        </div>
      )}
    </div>
  )
}

export default function ResumenVentasPage() {
  const { profile } = useAuth()
  const supabase     = createClient()

  const [leads,    setLeads]    = useState<LeadData[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([])
  const [cargando, setCargando] = useState(true)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // ── Filtro de Período (para las métricas con fecha: clientes nuevos, tasa de
  //    aprobación de crédito, días promedio por etapa) ──
  const [preset, setPreset] = useState<PeriodoPreset>('mes')
  const [desdeManual, setDesdeManual] = useState(ymdLocal(new Date()))
  const [hastaManual, setHastaManual] = useState(ymdLocal(new Date()))
  const periodoRango = useMemo(() => calcularRango(preset, desdeManual, hastaManual), [preset, desdeManual, hastaManual])

  const rolNorm = (profile?.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'

  // ── Filtro de Asesores — Gerencia/Dueño eligen 1+; los demás solo se ven a sí mismos ──
  const [asesoresSel, setAsesoresSel] = useState<Set<string> | null>(null) // null = todos

  useEffect(() => {
    if (!profile) return
    if (!esGerencia) setAsesoresSel(new Set([profile.id]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, esGerencia])

  const toggleAsesor = (id: string) => {
    setAsesoresSel(prev => {
      const base = prev ?? new Set(usuarios.map(u => u.id).concat(['__sin__']))
      const n = new Set(base)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  useEffect(() => {
    if (!profile?.tenant_id) return

    supabase
      .from('usuarios')
      .select('id, nombre, email')
      .eq('tenant_id', profile.tenant_id)
      .eq('es_asesor', true)
      .order('nombre')
      .then(({ data }) => {
        setUsuarios((data ?? []).map(u => ({
          id: u.id as string,
          nombre: (u.nombre as string | null) || (u.email as string | null) || 'Usuario',
        })))
      })

    async function cargar() {
      if (!profile) return
      setCargando(true)

      let query = supabase
        .from('clientes')
        .select(`
          id, nombre, celular, etapa_venta, etapa_venta_orden,
          valor_estimado_venta, proxima_accion, proxima_accion_fecha,
          lead_source, sin_respuesta_asesor_desde, assigned_to,
          nombre_pendiente_aprobacion, alistamiento_orden_id,
          conversaciones ( id, canal, no_leidos_count )
        `)
        .eq('tenant_id', profile.tenant_id)
        .eq('en_seguimiento_ventas', true)
        .order('etapa_venta_orden', { ascending: true, nullsFirst: false })
        .limit(500)

      const rolNorm = (profile.rol ?? '').toLowerCase().replace('ñ', 'n')
      if (rolNorm !== 'gerencia' && rolNorm !== 'control_total' && rolNorm !== 'dueno') {
        const { data: compartidos } = await supabase
          .from('clientes_visibilidad').select('cliente_id').eq('usuario_id', profile.id)
        const ids = (compartidos ?? []).map(c => c.cliente_id)
        query = ids.length > 0
          ? query.or(`assigned_to.eq.${profile.id},id.in.(${ids.join(',')})`)
          : query.eq('assigned_to', profile.id)
      }

      const { data: raw } = await query

      const extraMap: Record<string, Record<string, unknown>> = {}
      if ((raw ?? []).length > 0) {
        const ids = (raw ?? []).map(c => c.id as string)
        const { data: extras } = await supabase
          .from('clientes')
          .select('id, primer_apellido, cedula, email, estado_aprobacion_matricula, aprobado_matricula_por, placa, numero_carta_negociacion, numero_factura')
          .in('id', ids)
        for (const e of extras ?? []) extraMap[e.id as string] = e as Record<string, unknown>
      }

      const etiquetasMap: Record<string, { id: string; nombre: string; color: string }[]> = {}
      if ((raw ?? []).length > 0) {
        try {
          const ids = (raw ?? []).map(c => c.id as string)
          const { data: etRows } = await supabase
            .from('clientes_etiquetas')
            .select('cliente_id, etiquetas_venta(id, nombre, color)')
            .in('cliente_id', ids)
          for (const row of (etRows ?? []) as unknown as { cliente_id: string; etiquetas_venta: { id: string; nombre: string; color: string } | null }[]) {
            if (!row.etiquetas_venta) continue
            if (!etiquetasMap[row.cliente_id]) etiquetasMap[row.cliente_id] = []
            etiquetasMap[row.cliente_id].push(row.etiquetas_venta)
          }
        } catch { /* ignorar */ }
      }

      const clientesConAlistamiento = new Set<string>()
      for (const c of (raw ?? [])) {
        if ((c as Record<string, unknown>).alistamiento_orden_id)
          clientesConAlistamiento.add(c.id as string)
      }
      const idsEnEspera = (raw ?? [])
        .filter(c => c.etapa_venta === 'espera_entrega' || c.etapa_venta === 'entregada')
        .map(c => c.id as string)
      if (idsEnEspera.length > 0) {
        try {
          const { data: subcats } = await supabase
            .from('subcategorias_servicio').select('id').ilike('nombre', '%alistamiento%')
          const subcatIds = (subcats ?? []).map(s => s.id as string)
          if (subcatIds.length > 0) {
            const { data: ords } = await supabase
              .from('ordenes').select('cliente_id')
              .eq('tenant_id', profile.tenant_id).eq('tipo_servicio', 'uma')
              .in('cliente_id', idsEnEspera).in('subcategoria_servicio_id', subcatIds)
              .not('cliente_id', 'is', null)
            for (const o of ords ?? []) if (o.cliente_id) clientesConAlistamiento.add(o.cliente_id as string)
          }
        } catch { /* non-critical */ }
      }

      const mapped: LeadData[] = (raw ?? []).map(c => {
        const convs = (c.conversaciones as { id: string; canal: string; no_leidos_count: number }[] | null) ?? []
        const noLeidos = convs.reduce((s, cv) => s + (cv.no_leidos_count ?? 0), 0)
        const ex = extraMap[c.id as string] ?? {}
        return {
          id: c.id as string,
          etapa_venta: (c.etapa_venta ?? 'nuevo') as EtapaVenta,
          etapa_venta_orden: (c.etapa_venta_orden ?? 0) as number,
          moto_interes: null,
          valor_estimado_venta: (c.valor_estimado_venta ?? null) as number | null,
          proxima_accion: (c.proxima_accion ?? null) as string | null,
          proxima_accion_fecha: (c.proxima_accion_fecha ?? null) as string | null,
          canal: convs[0]?.canal ?? 'manual',
          lead_source: (c.lead_source ?? null) as string | null,
          no_leidos_count: noLeidos,
          sin_respuesta_asesor_desde: (c.sin_respuesta_asesor_desde ?? null) as string | null,
          assigned_to: (c.assigned_to ?? null) as string | null,
          cliente: { id: c.id as string, nombre: c.nombre as string | null, celular: c.celular as string | null, placa: (ex.placa ?? null) as string | null },
          alistamientoOrdenId: ((c as Record<string, unknown>).alistamiento_orden_id ?? null) as string | null,
          cliente_apellido: (ex.primer_apellido ?? null) as string | null,
          cliente_documento: (ex.cedula ?? null) as string | null,
          cliente_email: (ex.email ?? null) as string | null,
          nombre_pendiente_aprobacion: (c.nombre_pendiente_aprobacion ?? null) as boolean | null,
          leads_campana: [],
          todas_conversaciones: convs.map(cv => ({ id: cv.id, canal: cv.canal, no_leidos_count: cv.no_leidos_count ?? 0 })),
          etiquetas: etiquetasMap[c.id as string] ?? [],
          tieneAlistamiento: (c.etapa_venta === 'espera_entrega' || c.etapa_venta === 'entregada')
            ? clientesConAlistamiento.has(c.id as string)
            : undefined,
          estadoAprobacionMatricula: ((ex.estado_aprobacion_matricula ?? 'pendiente') as 'pendiente' | 'aprobado' | 'rechazado'),
          aprobadoMatriculaPor: (ex.aprobado_matricula_por ?? null) as string | null,
          tienePlaca: (ETAPAS_NECESITAN_PLACA as EtapaVenta[]).includes(c.etapa_venta as EtapaVenta)
            ? !!(ex.placa)
            : undefined,
          numero_factura: (ex.numero_factura ?? null) as string | null,
        }
      })

      setLeads(mapped)
      setCargando(false)
    }

    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id, profile?.rol, profile?.id])

  const filterPanel = (
    <div className="py-2 px-2 space-y-1">
      <FilterDropdown title="Período">
        <PeriodoFilter
          preset={preset} desdeManual={desdeManual} hastaManual={hastaManual}
          onChangePreset={setPreset} onChangeDesdeManual={setDesdeManual} onChangeHastaManual={setHastaManual}
        />
      </FilterDropdown>

      {esGerencia && (
        <FilterDropdown title="Asesores" badge={asesoresSel ? asesoresSel.size : 0}>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Asesores</p>
          <label className="flex items-center gap-2 py-1 cursor-pointer group">
            <input type="checkbox" checked={asesoresSel === null}
              onChange={() => setAsesoresSel(null)}
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
            <span className="text-xs font-semibold text-gray-700">Todos</span>
          </label>
          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1 mt-1 border-t border-gray-100 pt-1">
            {usuarios.map(u => (
              <label key={u.id} className="flex items-center gap-2 py-1 cursor-pointer group">
                <input type="checkbox" checked={asesoresSel === null || asesoresSel.has(u.id)}
                  onChange={() => toggleAsesor(u.id)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                <span className="text-xs text-gray-700 group-hover:text-gray-900 select-none truncate">{u.nombre}</span>
              </label>
            ))}
          </div>
        </FilterDropdown>
      )}
    </div>
  )

  return (
    <div className="bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 sm:px-5 pt-5 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Resumen Ventas</h1>
            <p className="text-sm text-gray-500 mt-0.5">Métricas generales del pipeline de ventas</p>
          </div>
          <button
            onClick={() => setMobileFiltersOpen(true)}
            className="md:hidden flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 12h10M10 20h4" />
            </svg>
            Filtros
          </button>
        </div>
      </div>

      <div className="flex">
        <aside className="hidden md:block w-52 flex-shrink-0 bg-white border-r border-gray-200 sticky top-[89px] self-start h-[calc(100vh-89px)]">
          {filterPanel}
        </aside>

        {mobileFiltersOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileFiltersOpen(false)} />
            <aside className="relative w-72 max-w-[85vw] h-full bg-white flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="font-semibold text-sm">Filtros</span>
                <button onClick={() => setMobileFiltersOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1">{filterPanel}</div>
            </aside>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-5">
          {cargando ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Cargando resumen de ventas...</p>
              </div>
            </div>
          ) : (
            <VistaResumen
              leads={leads}
              tenantId={profile?.tenant_id ?? ''}
              usuarios={usuarios}
              asesoresFiltro={asesoresSel}
              periodoRango={periodoRango}
            />
          )}
        </main>
      </div>
    </div>
  )
}
