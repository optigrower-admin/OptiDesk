import { createAdminClient } from '@/lib/supabase/admin'
import { ETAPA_ORDEN, type EtapaVenta } from './pipeline'

type Supa = ReturnType<typeof createAdminClient>

export interface InventarioColorRow {
  id: string
  colorId: string | null
  colorNombre: string | null
  cantidad: number
}

export interface InventarioMotoRow {
  moto_catalogo_id: string
  referencia: string
  cantidad_total: number
  comprometidas: number
  para_entregar: number
  entregadas: number
  disponibles: number
  colores: InventarioColorRow[]
}

// Comprometidas: etapa Vendida/Carta Aprobación en adelante, antes de En matrícula.
// Para entregar: etapa En matrícula en adelante, antes de Entregada.
// Entregadas: etapa Entregada en adelante — ya se descontaron del total real.
//
// El desglose por color (colores[]) es solo el stock que se registró por
// color — el pipeline de ventas no guarda qué color compró cada cliente, así
// que Comprometidas/Para entregar/Disponibles quedan a nivel de la moto en
// general (sumando todos los colores), no por color individual.
export async function calcularInventarioMotos(supabase: Supa, tenantId: string): Promise<InventarioMotoRow[]> {
  const { data: inv } = await supabase
    .from('inventario_motos')
    .select('id, moto_catalogo_id, color_id, cantidad_total, motos_catalogo(referencia), motos_catalogo_colores(nombre)')
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

  // Agrupar los renglones de inventario (uno por color, o uno sin color) por moto.
  const porMoto = new Map<string, { referencia: string; filas: { id: string; colorId: string | null; colorNombre: string | null; cantidad: number }[] }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (inv as any[])) {
    const motoId = row.moto_catalogo_id as string
    const referencia = Array.isArray(row.motos_catalogo) ? row.motos_catalogo[0]?.referencia : row.motos_catalogo?.referencia
    const colorNombre = Array.isArray(row.motos_catalogo_colores) ? row.motos_catalogo_colores[0]?.nombre : row.motos_catalogo_colores?.nombre
    if (!porMoto.has(motoId)) porMoto.set(motoId, { referencia: referencia ?? 'Sin referencia', filas: [] })
    porMoto.get(motoId)!.filas.push({
      id: row.id as string, colorId: row.color_id ?? null, colorNombre: colorNombre ?? null, cantidad: row.cantidad_total ?? 0,
    })
  }

  return [...porMoto.entries()].map(([motoId, { referencia, filas }]) => {
    const cantidadTotal = filas.reduce((s, f) => s + f.cantidad, 0)
    const comprometidas = comprometidasPorMoto.get(motoId) ?? 0
    const paraEntregar = paraEntregarPorMoto.get(motoId) ?? 0
    const entregadas = entregadasPorMoto.get(motoId) ?? 0
    const totalEfectivo = cantidadTotal - entregadas
    const disponibles = Math.max(0, totalEfectivo - comprometidas - paraEntregar)
    return {
      moto_catalogo_id: motoId, referencia,
      cantidad_total: cantidadTotal, comprometidas, para_entregar: paraEntregar,
      entregadas, disponibles, colores: filas,
    }
  })
}
