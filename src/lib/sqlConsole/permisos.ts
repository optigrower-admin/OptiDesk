import type { SupabaseClient } from '@supabase/supabase-js'
import { NOMBRES_TABLAS_WHITELIST } from './whitelist'

export interface AccesoResuelto {
  puedeAcceder: boolean
  tablasPermitidas: string[] // nombres de tabla; vacío interno = todas las de la whitelist
  puedeExportar: boolean
  limiteFilasPreview: number
}

const SIN_ACCESO: AccesoResuelto = {
  puedeAcceder: false,
  tablasPermitidas: [],
  puedeExportar: false,
  limiteFilasPreview: 500,
}

/**
 * Resuelve el permiso efectivo de un usuario sobre Consultas SQL:
 * fila de excepción por usuario > fila default del rol > sin acceso.
 * control_total/dueno siempre tienen acceso completo (igual que el resto de la app).
 */
export async function resolverAcceso(
  supabase: SupabaseClient,
  tenantId: string,
  usuarioId: string,
  rol: string,
): Promise<AccesoResuelto> {
  if (rol === 'control_total' || rol === 'dueno') {
    return {
      puedeAcceder: true,
      tablasPermitidas: [...NOMBRES_TABLAS_WHITELIST],
      puedeExportar: true,
      limiteFilasPreview: 500,
    }
  }

  const { data: filaUsuario } = await supabase
    .from('sql_console_permisos')
    .select('puede_acceder, tablas_permitidas, puede_exportar, limite_filas_preview')
    .eq('tenant_id', tenantId)
    .eq('usuario_id', usuarioId)
    .maybeSingle()

  const fila = filaUsuario ?? (
    await supabase
      .from('sql_console_permisos')
      .select('puede_acceder, tablas_permitidas, puede_exportar, limite_filas_preview')
      .eq('tenant_id', tenantId)
      .eq('rol', rol)
      .is('usuario_id', null)
      .maybeSingle()
  ).data

  if (!fila || !fila.puede_acceder) return SIN_ACCESO

  const tablasFila = Array.isArray(fila.tablas_permitidas) ? fila.tablas_permitidas as string[] : []
  const tablasPermitidas = tablasFila.length > 0
    ? tablasFila.filter(t => NOMBRES_TABLAS_WHITELIST.has(t))
    : [...NOMBRES_TABLAS_WHITELIST]

  return {
    puedeAcceder: true,
    tablasPermitidas,
    puedeExportar: !!fila.puede_exportar,
    limiteFilasPreview: fila.limite_filas_preview ?? 500,
  }
}
