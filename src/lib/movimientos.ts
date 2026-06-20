import type { SupabaseClient } from '@supabase/supabase-js'

interface MovimientoBase {
  tenantId: string
  repuesto_uma_id?: string | null
  repuesto_externo_id?: string | null
  cantidad: number
  costo_unitario: number
  precio_unitario: number
  orden_id?: string | null
  item_orden_id?: string | null
  registrado_por?: string | null
  fecha?: string
}

export async function registrarSalida(
  supabase: SupabaseClient,
  motivo: 'uso_st' | 'venta_directa',
  params: MovimientoBase
) {
  await supabase.from('movimientos_inventario').insert({
    tenant_id: params.tenantId,
    tipo: 'salida',
    motivo,
    repuesto_uma_id: params.repuesto_uma_id ?? null,
    repuesto_externo_id: params.repuesto_externo_id ?? null,
    cantidad: params.cantidad,
    costo_unitario: params.costo_unitario,
    precio_unitario: params.precio_unitario,
    orden_id: params.orden_id ?? null,
    item_orden_id: params.item_orden_id ?? null,
    registrado_por: params.registrado_por ?? null,
    ...(params.fecha ? { created_at: params.fecha } : {}),
  })

  // Decrementar stock UMA atómicamente
  if (params.repuesto_uma_id) {
    await supabase.rpc('ajustar_stock_uma', {
      p_repuesto_id: params.repuesto_uma_id,
      p_delta: -params.cantidad,
    })
  }
}

export async function registrarDevolucion(
  supabase: SupabaseClient,
  params: MovimientoBase
) {
  await supabase.from('movimientos_inventario').insert({
    tenant_id: params.tenantId,
    tipo: 'entrada',
    motivo: 'devolucion',
    repuesto_uma_id: params.repuesto_uma_id ?? null,
    repuesto_externo_id: params.repuesto_externo_id ?? null,
    cantidad: params.cantidad,
    costo_unitario: params.costo_unitario,
    precio_unitario: params.precio_unitario,
    orden_id: params.orden_id ?? null,
    item_orden_id: params.item_orden_id ?? null,
    registrado_por: params.registrado_por ?? null,
  })

  // Devolver stock UMA
  if (params.repuesto_uma_id) {
    await supabase.rpc('ajustar_stock_uma', {
      p_repuesto_id: params.repuesto_uma_id,
      p_delta: params.cantidad,
    })
  }
}

export async function registrarEntrada(
  supabase: SupabaseClient,
  params: MovimientoBase & { proveedor?: string; numero_factura?: string; notas?: string }
) {
  await supabase.from('movimientos_inventario').insert({
    tenant_id: params.tenantId,
    tipo: 'entrada',
    motivo: 'compra',
    repuesto_uma_id: params.repuesto_uma_id ?? null,
    repuesto_externo_id: params.repuesto_externo_id ?? null,
    cantidad: params.cantidad,
    costo_unitario: params.costo_unitario,
    precio_unitario: params.precio_unitario ?? params.costo_unitario,
    proveedor: params.proveedor ?? null,
    numero_factura: params.numero_factura ?? null,
    notas: params.notas ?? null,
    registrado_por: params.registrado_por ?? null,
  })

  // Incrementar stock
  if (params.repuesto_uma_id) {
    await supabase.rpc('ajustar_stock_uma', {
      p_repuesto_id: params.repuesto_uma_id,
      p_delta: params.cantidad,
    })
  }
  if (params.repuesto_externo_id) {
    await supabase.rpc('ajustar_stock_externo', {
      p_repuesto_id: params.repuesto_externo_id,
      p_delta: params.cantidad,
    })
  }
}
