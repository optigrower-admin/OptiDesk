'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ETAPA_ORDEN, type EtapaVenta } from '@/lib/ventas/pipeline'
import VentasClient from './VentasClient'
import type { LeadData } from './components/LeadCard'

export default function VentasPage() {
  const { profile } = useAuth()
  const supabase     = createClient()

  const [leads, setLeads]     = useState<LeadData[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!profile?.tenant_id) return

    async function cargar() {
      setCargando(true)
      const { data: raw } = await supabase
        .from('conversaciones')
        .select(`
          id,
          etapa_venta,
          etapa_venta_orden,
          moto_interes,
          valor_estimado_venta,
          proxima_accion,
          proxima_accion_fecha,
          canal,
          lead_source,
          no_leidos_count,
          sin_respuesta_asesor_desde,
          clientes ( id, nombre, celular )
        `)
        .eq('tenant_id', profile.tenant_id)
        .in('etapa_venta', ['nuevo', 'calificado', 'demo', 'propuesta', 'negociacion', 'ganado', 'perdido'])
        .order('etapa_venta_orden', { ascending: true, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(500)

      const mapped: LeadData[] = (raw ?? []).map((l) => {
        const clienteArr = l.clientes as { id: string; nombre: string | null; celular: string | null }[] | null
        const clienteRaw = Array.isArray(clienteArr) ? clienteArr[0] : (clienteArr as { id: string; nombre: string | null; celular: string | null } | null)
        const noLeidos = (l.no_leidos_count ?? 0) as number
        return {
          id:                         l.id as string,
          etapa_venta:                (l.etapa_venta ?? 'nuevo') as EtapaVenta,
          etapa_venta_orden:          (l.etapa_venta_orden ?? 0) as number,
          moto_interes:               (l.moto_interes ?? null) as string | null,
          valor_estimado_venta:       (l.valor_estimado_venta ?? null) as number | null,
          proxima_accion:             (l.proxima_accion ?? null) as string | null,
          proxima_accion_fecha:       (l.proxima_accion_fecha ?? null) as string | null,
          canal:                      (l.canal ?? 'manual') as string,
          lead_source:                (l.lead_source ?? null) as string | null,
          no_leidos_count:            noLeidos,
          sin_respuesta_asesor_desde: (l.sin_respuesta_asesor_desde ?? null) as string | null,
          cliente:                    clienteRaw ? { id: clienteRaw.id, nombre: clienteRaw.nombre, celular: clienteRaw.celular } : null,
          leads_campana:              [],
          todas_conversaciones:       [{ id: l.id as string, canal: (l.canal ?? 'manual') as string, no_leidos_count: noLeidos }],
        }
      })

      // Group by cliente_id — one card per real client
      const byCliente = new Map<string, LeadData[]>()
      for (const lead of mapped) {
        const key = lead.cliente?.id ?? lead.id
        if (!byCliente.has(key)) byCliente.set(key, [])
        byCliente.get(key)!.push(lead)
      }

      const grouped: LeadData[] = []
      for (const convs of byCliente.values()) {
        // Primary = most advanced etapa; tie-break by most recent activity
        convs.sort((a, b) => (ETAPA_ORDEN[b.etapa_venta] ?? 0) - (ETAPA_ORDEN[a.etapa_venta] ?? 0))
        const primary = convs[0]
        grouped.push({
          ...primary,
          no_leidos_count:      convs.reduce((s, c) => s + c.no_leidos_count, 0),
          todas_conversaciones: convs.map(c => ({ id: c.id, canal: c.canal, no_leidos_count: c.no_leidos_count })),
        })
      }

      setLeads(grouped)
      setCargando(false)
    }

    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id])

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Cargando pipeline...</p>
        </div>
      </div>
    )
  }

  return <VentasClient leadsIniciales={leads} tenantId={profile?.tenant_id ?? ''} />
}
