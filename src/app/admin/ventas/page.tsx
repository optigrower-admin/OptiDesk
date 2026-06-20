'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import type { EtapaVenta } from '@/lib/ventas/pipeline'
import VentasClient from './VentasClient'
import type { LeadData } from './components/LeadCard'

export default function VentasPage() {
  const { profile } = useAuth()
  const supabase     = createClient()

  const [leads, setLeads]       = useState<LeadData[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!profile?.tenant_id) return

    async function cargar() {
      if (!profile) return
      setCargando(true)

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
          conversaciones ( id, canal, no_leidos_count )
        `)
        .eq('tenant_id', profile.tenant_id)
        .eq('en_seguimiento_ventas', true)
        .order('etapa_venta_orden', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(500)

      // Gerencia ve todos los clientes en seguimiento; el resto solo los suyos
      // o los que Gerencia le compartió explícitamente vía clientes_visibilidad.
      if (profile.rol !== 'gerencia' && profile.rol !== 'control_total') {
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

      const mapped: LeadData[] = (raw ?? []).map((c) => {
        const convs = (c.conversaciones as { id: string; canal: string; no_leidos_count: number }[] | null) ?? []
        const motosInteres = (c.motos_interes_resumen as unknown as { motos_catalogo: { referencia: string } | null }[] | null) ?? []
        const motoLabel = motosInteres.map(m => m.motos_catalogo?.referencia).filter(Boolean).join(' · ')
        const noLeidos = convs.reduce((s, cv) => s + (cv.no_leidos_count ?? 0), 0)

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
          cliente:                    { id: c.id as string, nombre: c.nombre as string | null, celular: c.celular as string | null },
          leads_campana:              [],
          todas_conversaciones:       convs.map(cv => ({ id: cv.id, canal: cv.canal, no_leidos_count: cv.no_leidos_count ?? 0 })),
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
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Cargando seguimiento de ventas...</p>
        </div>
      </div>
    )
  }

  return <VentasClient leadsIniciales={leads} tenantId={profile?.tenant_id ?? ''} />
}
