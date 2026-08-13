'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { EtapaVenta } from '@/lib/ventas/pipeline'
import { ETAPAS_NECESITAN_PLACA } from '@/lib/ventas/pipeline'
import VentasClient from './VentasClient'
import type { LeadData } from './components/LeadCard'

export default function VentasPage() {
  const { profile } = useAuth()
  const supabase     = createClient()

  const [leads, setLeads]       = useState<LeadData[]>([])
  const [cargando, setCargando] = useState(true)
  const cargadoRef              = useRef(false)   // true después de la primera carga exitosa

  useEffect(() => {
    if (!profile?.tenant_id) return

    async function cargar() {
      if (!profile) return
      // Solo mostrar spinner en la primera carga; las recargas de fondo son silenciosas
      if (!cargadoRef.current) setCargando(true)

      let query = supabase
        .from('clientes')
        .select(`
          id,
          nombre,
          celular,
          etapa_venta,
          etapa_venta_orden,
          motos_interes_resumen:clientes_motos_interes(moto_catalogo_id, motos_catalogo(referencia)),
          valor_estimado_venta,
          proxima_accion,
          proxima_accion_fecha,
          lead_source,
          sin_respuesta_asesor_desde,
          assigned_to,
          nombre_pendiente_aprobacion,
          alistamiento_orden_id,
          placa,
          numero_carta_negociacion,
          numero_factura,
          fecha_entrega,
          automatizado,
          flujo_activo_id,
          created_at,
          updated_at,
          primer_apellido,
          cedula,
          email,
          estado_aprobacion_matricula,
          aprobado_matricula_por,
          revision_perdida,
          conversaciones ( id, canal, no_leidos_count )
        `)
        .eq('tenant_id', profile.tenant_id)
        .eq('en_seguimiento_ventas', true)
        .order('etapa_venta_orden', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(500)

      // Gerencia ve todos los clientes en seguimiento; el resto solo los suyos
      // o los que Gerencia le compartió explícitamente vía clientes_visibilidad.
      const rolNorm = (profile.rol ?? '').toLowerCase().replace('ñ', 'n')
      if (rolNorm !== 'gerencia' && rolNorm !== 'control_total' && rolNorm !== 'dueno') {
        const { data: compartidos } = await supabase
          .from('clientes_visibilidad')
          .select('cliente_id')
          .eq('usuario_id', profile.id)
        const idsCompartidos = (compartidos ?? []).map(c => c.cliente_id)
        if (idsCompartidos.length > 0) {
          query = query.or(`assigned_to.eq.${profile.id},id.in.(${idsCompartidos.join(',')})`)
        } else {
          query = query.eq('assigned_to', profile.id)
        }
      }

      const { data: raw } = await query

      const ids = (raw ?? []).map((c) => c.id as string)
      const idsEnEspera = (raw ?? [])
        .filter(c => c.etapa_venta === 'espera_entrega' || c.etapa_venta === 'entregada')
        .map(c => c.id as string)

      // Clientes con alistamiento vinculado directamente (del campo en el select principal)
      const clientesConAlistamiento = new Set<string>()
      for (const c of (raw ?? [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((c as any).alistamiento_orden_id) clientesConAlistamiento.add(c.id as string)
      }

      // Datos secundarios: etiquetas, crédito y alistamiento corren en paralelo
      type EtiquetaRow = { id: string; nombre: string; color: string }
      const etiquetasMap: Record<string, EtiquetaRow[]> = {}
      const creditoMap: Record<string, { aprobada: string | null; rechazadas: string[] }> = {}
      const creditoPorEntidadMap: Record<string, Record<string, string>> = {}
      const colaboradoresMap: Record<string, string[]> = {}

      if (ids.length > 0) {
        const [etiquetasRows, creditoResult, alistamientoIds, visibilidadRows] = await Promise.all([
          // 1. Etiquetas
          (async () => {
            try {
              const { data } = await supabase.from('clientes_etiquetas')
                .select('cliente_id, etiquetas_venta(id, nombre, color)')
                .in('cliente_id', ids)
              return data ?? []
            } catch { return [] }
          })(),

          // 2. Crédito (dos pasos internos, pero corre en paralelo con las otras)
          (async (): Promise<{
            aprobadas: Record<string, { aprobada: string | null; rechazadas: string[] }>
            porEntidad: Record<string, Record<string, string>>
          }> => {
            try {
              const { data: estudiosRows } = await supabase
                .from('clientes_credito_estudio')
                .select('cliente_id, entidad_id, estado')
                .in('cliente_id', ids)
              if (!(estudiosRows ?? []).length) return { aprobadas: {}, porEntidad: {} }
              const entidadIds = [...new Set((estudiosRows ?? []).map(r => r.entidad_id as string))]
              const { data: entRows } = await supabase
                .from('entidades_financieras').select('id, nombre').in('id', entidadIds)
              const entNombreMap: Record<string, string> = {}
              for (const e of entRows ?? []) entNombreMap[e.id as string] = e.nombre as string
              const aprobadas: Record<string, { aprobada: string | null; rechazadas: string[] }> = {}
              const porEntidad: Record<string, Record<string, string>> = {}
              for (const row of estudiosRows ?? []) {
                const clienteId = row.cliente_id as string
                if (!porEntidad[clienteId]) porEntidad[clienteId] = {}
                porEntidad[clienteId][row.entidad_id as string] = row.estado as string

                const nombre = entNombreMap[row.entidad_id as string]
                if (!nombre) continue
                if (!aprobadas[clienteId]) aprobadas[clienteId] = { aprobada: null, rechazadas: [] }
                if (row.estado === 'aprobado') aprobadas[clienteId].aprobada = nombre
                if (row.estado === 'rechazado') aprobadas[clienteId].rechazadas.push(nombre)
              }
              return { aprobadas, porEntidad }
            } catch { return { aprobadas: {}, porEntidad: {} } }
          })(),

          // 3. Alistamiento UMA (dos pasos internos, corre en paralelo con las otras)
          idsEnEspera.length > 0
            ? (async (): Promise<string[]> => {
                try {
                  const { data: subcats } = await supabase
                    .from('subcategorias_servicio').select('id').ilike('nombre', '%alistamiento%')
                  const subcatIds = (subcats ?? []).map(s => s.id as string)
                  if (subcatIds.length > 0) {
                    const { data: ords } = await supabase.from('ordenes').select('cliente_id')
                      .eq('tenant_id', profile.tenant_id).eq('tipo_servicio', 'uma')
                      .in('cliente_id', idsEnEspera).in('subcategoria_servicio_id', subcatIds)
                      .not('cliente_id', 'is', null)
                    return (ords ?? []).map(o => o.cliente_id as string).filter(Boolean)
                  }
                  // Fallback: categoría principal
                  const { data: cats } = await supabase.from('categorias_servicio').select('id')
                    .eq('tenant_id', profile.tenant_id).ilike('nombre', '%alistamiento%')
                  const catIds = (cats ?? []).map(c => c.id as string)
                  if (catIds.length > 0) {
                    const { data: ords } = await supabase.from('ordenes').select('cliente_id')
                      .eq('tenant_id', profile.tenant_id).eq('tipo_servicio', 'uma')
                      .in('cliente_id', idsEnEspera).in('categoria_servicio_id', catIds)
                      .not('cliente_id', 'is', null)
                    return (ords ?? []).map(o => o.cliente_id as string).filter(Boolean)
                  }
                } catch { /* non-critical */ }
                return []
              })()
            : Promise.resolve([] as string[]),

          // 4. Visibilidad compartida — quién más tiene acceso a cada cliente
          (async () => {
            try {
              const { data } = await supabase.from('clientes_visibilidad')
                .select('cliente_id, usuarios(nombre)')
                .in('cliente_id', ids)
              return data ?? []
            } catch { return [] }
          })(),
        ])

        // Aplicar resultados
        for (const row of (etiquetasRows as unknown as { cliente_id: string; etiquetas_venta: EtiquetaRow | null }[])) {
          if (!row.etiquetas_venta) continue
          if (!etiquetasMap[row.cliente_id]) etiquetasMap[row.cliente_id] = []
          etiquetasMap[row.cliente_id].push(row.etiquetas_venta)
        }
        Object.assign(creditoMap, creditoResult.aprobadas)
        Object.assign(creditoPorEntidadMap, creditoResult.porEntidad)
        for (const id of alistamientoIds) clientesConAlistamiento.add(id)
        for (const row of (visibilidadRows as unknown as { cliente_id: string; usuarios: { nombre: string } | { nombre: string }[] | null }[])) {
          const u = Array.isArray(row.usuarios) ? row.usuarios[0] : row.usuarios
          if (!u?.nombre) continue
          if (!colaboradoresMap[row.cliente_id]) colaboradoresMap[row.cliente_id] = []
          colaboradoresMap[row.cliente_id].push(u.nombre)
        }
      }

      const mapped: LeadData[] = (raw ?? []).map((c) => {
        const convs = (c.conversaciones as { id: string; canal: string; no_leidos_count: number }[] | null) ?? []
        const motosInteres = (c.motos_interes_resumen as unknown as { motos_catalogo: { referencia: string } | null }[] | null) ?? []
        const motoLabel = motosInteres.map(m => m.motos_catalogo?.referencia).filter(Boolean).join(' · ')
        const noLeidos = convs.reduce((s, cv) => s + (cv.no_leidos_count ?? 0), 0)
        const etiquetas = etiquetasMap[c.id as string] ?? []
        const cr = c as Record<string, unknown>

        return {
          id:                         c.id as string,
          etapa_venta:                (c.etapa_venta ?? 'nuevo') as EtapaVenta,
          etapa_venta_orden:          (c.etapa_venta_orden ?? 0) as number,
          moto_interes:               motoLabel || null,
          valor_estimado_venta:       (c.valor_estimado_venta ?? null) as number | null,
          proxima_accion:             (c.proxima_accion ?? null) as string | null,
          proxima_accion_fecha:       (c.proxima_accion_fecha ?? null) as string | null,
          canal:                      convs[0]?.canal ?? 'manual',
          lead_source:                (c.lead_source ?? null) as string | null,
          no_leidos_count:            noLeidos,
          sin_respuesta_asesor_desde: (c.sin_respuesta_asesor_desde ?? null) as string | null,
          assigned_to:                (c.assigned_to ?? null) as string | null,
          cliente:                      { id: c.id as string, nombre: c.nombre as string | null, celular: c.celular as string | null, placa: (cr.placa ?? null) as string | null },
          alistamientoOrdenId:          (cr.alistamiento_orden_id ?? null) as string | null,
          cliente_apellido:             (cr.primer_apellido ?? null) as string | null,
          cliente_documento:            (cr.cedula ?? null) as string | null,
          cliente_email:                (cr.email ?? null) as string | null,
          nombre_pendiente_aprobacion:  (c.nombre_pendiente_aprobacion ?? null) as boolean | null,
          leads_campana:                [],
          todas_conversaciones:       convs.map(cv => ({ id: cv.id, canal: cv.canal, no_leidos_count: cv.no_leidos_count ?? 0 })),
          etiquetas,
          tieneAlistamiento: (c.etapa_venta === 'espera_entrega' || c.etapa_venta === 'entregada')
            ? clientesConAlistamiento.has(c.id as string)
            : undefined,
          estadoAprobacionMatricula: ((cr.estado_aprobacion_matricula ?? 'pendiente') as 'pendiente' | 'aprobado' | 'rechazado'),
          aprobadoMatriculaPor: (cr.aprobado_matricula_por ?? null) as string | null,
          revisionPerdida: (cr.revision_perdida ?? null) as 'falta_revision' | 'revisado' | null,
          colaboradores: colaboradoresMap[c.id as string] ?? [],
          tienePlaca: (ETAPAS_NECESITAN_PLACA as EtapaVenta[]).includes(c.etapa_venta as EtapaVenta)
            ? !!(cr.placa)
            : undefined,
          numero_carta_negociacion: (cr.numero_carta_negociacion ?? null) as string | null,
          numero_factura: (cr.numero_factura ?? null) as string | null,
          fecha_entrega:  (cr.fecha_entrega ?? null) as string | null,
          creditoAprobadoEntidad: creditoMap[c.id as string]?.aprobada ?? null,
          creditoRechazadoEntidades: creditoMap[c.id as string]?.rechazadas ?? [],
          creditoPorEntidad: creditoPorEntidadMap[c.id as string] ?? {},
          automatizado: cr.automatizado === true,
          updated_at: (cr.updated_at ?? null) as string | null,
          created_at: (cr.created_at ?? null) as string | null,
        }
      })

      setLeads(mapped)
      cargadoRef.current = true
      setCargando(false)
    }

    cargar()

    // Escuchar cambios en clientes en seguimiento (INSERT + UPDATE desde webhook)
    // IMPORTANTE: La tabla clientes debe estar en supabase_realtime (migration_v80).
    // Condición permisiva: recargar siempre que un cliente esté (o pase a estar) en seguimiento.
    const channel = supabase
      .channel(`ventas-nuevos-${profile.tenant_id}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'clientes',
          filter: `tenant_id=eq.${profile.tenant_id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (row.en_seguimiento_ventas) cargar()
        }
      )
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'clientes',
          filter: `tenant_id=eq.${profile.tenant_id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const old = payload.old as Record<string, unknown>
          // Solo recargar cuando un cliente ENTRA a seguimiento (INSERT silencioso o cambio de flag)
          // NO recargar en etapaCambio: ese evento lo dispara el propio usuario al mover tarjetas
          if (row.en_seguimiento_ventas && !old.en_seguimiento_ventas) cargar()
        }
      )
      .subscribe()

    // Polling de seguridad: recargar silenciosamente cada 3 min para capturar cambios
    // de otros usuarios (etapas, nuevos leads, etc.) sin interrumpir la UI
    const pollId = setInterval(() => { cargar() }, 180_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id, profile?.rol, profile?.id])

  // Mostrar spinner de primera carga solo si aún no tenemos datos
  // VentasClient SIEMPRE queda montado para no perder estado (ficha abierta, tab, etc.)
  const primeraCarga = cargando && leads.length === 0

  return (
    <div className="relative min-h-screen">
      {primeraCarga && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Cargando seguimiento de ventas...</p>
          </div>
        </div>
      )}
      <VentasClient leadsIniciales={leads} tenantId={profile?.tenant_id ?? ''} />
    </div>
  )
}
