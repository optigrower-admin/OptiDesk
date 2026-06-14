import { createAdminClient } from '@/lib/supabase/admin'

export type Recordatorio = {
  id: string
  conversacion_id: string
  tenant_id: string
  asignado_a: string | null
  nota: string | null
  fecha_recordatorio: string
  completado: boolean
  created_at: string
}

export async function getRecordatoriosVencidos(tenantId: string): Promise<Recordatorio[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('recordatorios')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('completado', false)
    .lte('fecha_recordatorio', new Date().toISOString())
    .order('fecha_recordatorio')
  return (data ?? []) as Recordatorio[]
}

export async function getRecordatoriosHoy(tenantId: string): Promise<Recordatorio[]> {
  const supabase = createAdminClient()
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
  const finHoy    = new Date(); finHoy.setHours(23, 59, 59, 999)

  const { data } = await supabase
    .from('recordatorios')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('completado', false)
    .gte('fecha_recordatorio', inicioHoy.toISOString())
    .lte('fecha_recordatorio', finHoy.toISOString())
    .order('fecha_recordatorio')
  return (data ?? []) as Recordatorio[]
}

export async function marcarCompletado(recordatorioId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('recordatorios')
    .update({ completado: true })
    .eq('id', recordatorioId)
}

export async function crearRecordatorio(params: {
  tenantId: string
  conversacionId: string
  asignadoA?: string
  nota?: string
  fechaRecordatorio: string
}): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('recordatorios').insert({
    tenant_id:          params.tenantId,
    conversacion_id:    params.conversacionId,
    asignado_a:         params.asignadoA ?? null,
    nota:               params.nota ?? null,
    fecha_recordatorio: params.fechaRecordatorio,
    completado:         false,
  })
}
