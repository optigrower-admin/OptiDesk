import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import VentasClient from './VentasClient'
import type { LeadData } from './components/LeadCard'

export const dynamic = 'force-dynamic'

async function getTenantId(): Promise<string | null> {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('usuarios').select('tenant_id').eq('id', user.id).single()
  return data?.tenant_id ?? null
}

export default async function VentasPage() {
  const tenantId = await getTenantId()
  if (!tenantId) redirect('/login')

  const supabase = createAdminClient()

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
    .eq('tenant_id', tenantId)
    .in('etapa_venta', ['nuevo', 'calificado', 'demo', 'propuesta', 'negociacion', 'ganado', 'perdido'])
    .order('etapa_venta_orden', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(500)

  // Try to load campaign data separately — silently skip if table doesn't exist yet
  const campanas: Record<string, string | null> = {}
  try {
    const { data: camp } = await supabase
      .from('leads_campana')
      .select('conversacion_id, utm_campaign')
      .eq('tenant_id', tenantId)
    if (camp) {
      for (const c of camp as { conversacion_id: string; utm_campaign: string | null }[]) {
        campanas[c.conversacion_id] = c.utm_campaign
      }
    }
  } catch { /* leads_campana might not exist yet */ }

  const leadsData: LeadData[] = (raw ?? []).map((l) => {
    const clienteArr = l.clientes as { id: string; nombre: string | null; celular: string | null }[] | null
    const clienteRaw = Array.isArray(clienteArr) ? clienteArr[0] : null
    const campaign   = campanas[l.id as string] ?? null
    return {
      id:                         l.id as string,
      etapa_venta:                (l.etapa_venta ?? 'nuevo') as LeadData['etapa_venta'],
      etapa_venta_orden:          (l.etapa_venta_orden ?? 0) as number,
      moto_interes:               (l.moto_interes ?? null) as string | null,
      valor_estimado_venta:       (l.valor_estimado_venta ?? null) as number | null,
      proxima_accion:             (l.proxima_accion ?? null) as string | null,
      proxima_accion_fecha:       (l.proxima_accion_fecha ?? null) as string | null,
      canal:                      (l.canal ?? 'manual') as string,
      lead_source:                (l.lead_source ?? null) as string | null,
      no_leidos_count:            (l.no_leidos_count ?? 0) as number,
      sin_respuesta_asesor_desde: (l.sin_respuesta_asesor_desde ?? null) as string | null,
      cliente:                    clienteRaw ? {
        id:      clienteRaw.id,
        nombre:  clienteRaw.nombre,
        celular: clienteRaw.celular,
      } : null,
      leads_campana: campaign ? [{ utm_campaign: campaign }] : [],
    }
  })

  return <VentasClient leadsIniciales={leadsData} tenantId={tenantId} />
}
