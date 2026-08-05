import { createAdminClient } from '@/lib/supabase/admin'
import { ETAPA_ORDEN, type EtapaVenta } from './pipeline'

type Supa = ReturnType<typeof createAdminClient>

export interface InventarioMotoRow {
  id: string
  moto_catalogo_id: string
  referencia: string
  cantidad_total: number
  comprometidas: number
  para_entregar: number
  entregadas: number
  disponibles: number
}

// Comprometidas: etapa Vendida/Carta Aprobación en adelante, antes de En matrícula.
// Para entregar: etapa En matrícula en adelante, antes de Entregada.
// Entregadas: etapa Entregada en adelante — ya se descontaron del total real.
export async function calcularInventarioMotos(supabase: Supa, tenantId: string): Promise<InventarioMotoRow[]> {
  const { data: inv } = await supabase
    .from('inventario_motos')
    .select('id, moto_catalogo_id, cantidad_total, motos_catalogo(referencia)')
    .eq('tenant_id', tenantId)
  if (!inv?.length) return []

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, etapa_venta, clientes_motos_interes(moto_catalogo_id)')
    .eq('tenant_id', tenantId)
    .eq('en_seguimiento_ventas', true)
    .limit(5000)

  const ordenGanado = ETAPA_ORDEN['ganado']
  const ordenEnMatricula = ETAPA_ORDEN['en_matricula']
  const ordenEntregada = ETAPA_ORDEN['entregada']

  const comprometidasPorMoto = new Map<string, number>()
  const paraEntregarPorMoto = new Map<string, number>()
  const entregadasPorMoto = new Map<string, number>()

  for (const c of (clientes ?? []) as { id: string; etapa_venta: EtapaVenta; clientes_motos_interes: { moto_catalogo_id: string }[] | { moto_catalogo_id: string } | null }[]) {
    const orden = ETAPA_ORDEN[c.etapa_venta] ?? -99
    if (orden < ordenGanado) continue
    const motos = Array.isArray(c.clientes_motos_interes) ? c.clientes_motos_interes : c.clientes_motos_interes ? [c.clientes_motos_interes] : []
    for (const m of motos) {
      const motoId = m?.moto_catalogo_id
      if (!motoId) continue
      const mapa = orden >= ordenEntregada ? entregadasPorMoto : orden >= ordenEnMatricula ? paraEntregarPorMoto : comprometidasPorMoto
      mapa.set(motoId, (mapa.get(motoId) ?? 0) + 1)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (inv as any[]).map(row => {
    const motoId = row.moto_catalogo_id as string
    const referencia = Array.isArray(row.motos_catalogo) ? row.motos_catalogo[0]?.referencia : row.motos_catalogo?.referencia
    const comprometidas = comprometidasPorMoto.get(motoId) ?? 0
    const paraEntregar = paraEntregarPorMoto.get(motoId) ?? 0
    const entregadas = entregadasPorMoto.get(motoId) ?? 0
    const totalEfectivo = (row.cantidad_total ?? 0) - entregadas
    const disponibles = Math.max(0, totalEfectivo - comprometidas - paraEntregar)
    return {
      id: row.id as string, moto_catalogo_id: motoId, referencia: referencia ?? 'Sin referencia',
      cantidad_total: row.cantidad_total ?? 0, comprometidas, para_entregar: paraEntregar,
      entregadas, disponibles,
    }
  })
}
