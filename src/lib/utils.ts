import type { SupabaseClient } from '@supabase/supabase-js'

export function formatCOP(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '$ 0'
  return '$ ' + Math.round(valor).toLocaleString('es-CO')
}

export function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/\s+/g, '').trim()
}

export async function generarCodigoExterno(
  supabase: SupabaseClient,
  tenantId: string
): Promise<string> {
  const { count } = await supabase
    .from('repuestos_externos')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  const siguiente = (count ?? 0) + 1
  return `EXT-${String(siguiente).padStart(3, '0')}`
}

export function calcularTotal(
  items: { precio_venta: number; cantidad: number }[]
): number {
  return items.reduce((sum, item) => sum + item.precio_venta * item.cantidad, 0)
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
