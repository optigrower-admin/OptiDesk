'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { EtapaVenta } from '@/lib/ventas/pipeline'
import { ETAPAS_NECESITAN_PLACA } from '@/lib/ventas/pipeline'
import VistaResumen from '../components/VistaResumen'
import type { LeadData } from '../components/LeadCard'

export default function ResumenVentasPage() {
  const { profile } = useAuth()
  const supabase     = createClient()

  const [leads,    setLeads]    = useState<LeadData[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([])
  const [cargando, setCargando] = useState(true)

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
          .select('id, primer_apellido, cedula, email, estado_aprobacion_matricula, placa, numero_factura')
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

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Cargando resumen de ventas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Resumen Ventas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Métricas generales del pipeline de ventas</p>
      </div>
      <VistaResumen leads={leads} tenantId={profile?.tenant_id ?? ''} usuarios={usuarios} />
    </div>
  )
}
