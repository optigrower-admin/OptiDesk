import type { SupabaseClient } from '@supabase/supabase-js'

interface AuditoriaParams {
  tenant_id: string
  tabla: string
  registro_id: string
  tipo: 'movimiento' | 'edicion' | 'eliminacion'
  valor_anterior?: Record<string, unknown>
  valor_nuevo?: Record<string, unknown>
  descripcion: string
  usuario_id?: string
}

export async function registrarAuditoria(
  supabase: SupabaseClient,
  params: AuditoriaParams
): Promise<void> {
  await supabase.from('auditoria').insert({
    tenant_id: params.tenant_id,
    tabla: params.tabla,
    registro_id: params.registro_id,
    tipo: params.tipo,
    valor_anterior: params.valor_anterior ?? null,
    valor_nuevo: params.valor_nuevo ?? null,
    descripcion: params.descripcion,
    usuario_id: params.usuario_id ?? null,
  })
}
