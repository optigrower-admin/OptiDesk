import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizarPlaca } from './utils'

export interface MotoExtras {
  marca: string
  modelo: string
  año: string
  color: string
  kilometraje: string
}

export interface UpsertMotoClienteParams {
  supabase: SupabaseClient
  tenantId: string
  placa: string | null
  clienteNombre: string
  cedula?: string | null
  celular?: string | null
  motoId?: string | null
  clienteId?: string | null
  motoExtras?: Partial<MotoExtras>
}

export interface UpsertMotoClienteResult {
  motoId: string | null
  clienteId: string | null
}

export async function upsertMotoCliente({
  supabase, tenantId, placa, clienteNombre,
  cedula, celular, motoId, clienteId, motoExtras,
}: UpsertMotoClienteParams): Promise<UpsertMotoClienteResult> {
  let finalMotoId: string | null = motoId ?? null
  let finalClienteId: string | null = clienteId ?? null

  // 1. Crear moto si no existe y hay placa
  const placaNorm = placa ? normalizarPlaca(placa) : null
  const kilometrajeNum = motoExtras?.kilometraje ? parseInt(motoExtras.kilometraje.replace(/\./g, ''), 10) : null

  if (placaNorm && !finalMotoId) {
    const { data } = await supabase
      .from('motos')
      .insert({
        tenant_id: tenantId,
        placa: placaNorm,
        marca: motoExtras?.marca || null,
        modelo: motoExtras?.modelo || null,
        año: motoExtras?.año ? parseInt(motoExtras.año) : null,
        color: motoExtras?.color || null,
        kilometraje: kilometrajeNum,
      })
      .select('id')
      .single()
    finalMotoId = data?.id ?? null
  } else if (finalMotoId && kilometrajeNum != null) {
    // La moto ya existía — el kilometraje cambia en cada entrada al taller,
    // así que se actualiza siempre. Vía RPC (no UPDATE directo) por la misma
    // razón que vincular_moto_cliente: la política RLS de motos solo permite
    // UPDATE a admin/gerencia y un mecánico creando la orden no podría.
    await supabase.rpc('actualizar_kilometraje_moto', { p_moto_id: finalMotoId, p_kilometraje: kilometrajeNum })
  }

  // 2. Buscar o crear cliente
  if (!finalClienteId) {
    if (cedula) {
      const { data: existing } = await supabase
        .from('clientes')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('cedula', cedula)
        .maybeSingle()

      if (existing) {
        finalClienteId = (existing as { id: string }).id
        // Actualizar solo campos que vienen con valor (no pisar con vacíos).
        // Vía RPC (no UPDATE directo) por la misma razón que el paso 3: la
        // política RLS de clientes solo permite UPDATE a admin/gerencia.
        if (clienteNombre || celular) {
          await supabase.rpc('actualizar_cliente_orden', {
            p_cliente_id: finalClienteId,
            p_nombre: clienteNombre || null,
            p_celular: celular || null,
          })
        }
      }
    }

    if (!finalClienteId && clienteNombre) {
      const { data } = await supabase
        .from('clientes')
        .insert({
          tenant_id: tenantId,
          nombre: clienteNombre,
          cedula: cedula || null,
          celular: celular || null,
        })
        .select('id')
        .single()
      finalClienteId = data?.id ?? null
    }
  }

  // 3. Vincular moto ↔ cliente — si el cliente cambió (la moto pasó de dueño),
  //    se actualiza igual; el trigger registrar_cambio_propietario() ya
  //    registra el cambio en historial_propietarios_moto automáticamente.
  //    Se usa el RPC vincular_moto_cliente (SECURITY DEFINER) y no un UPDATE
  //    directo porque la política RLS de motos solo permite UPDATE a
  //    admin/gerencia — un mecánico creando la orden no podría dejar
  //    asignado el propietario si se hiciera con el cliente normal.
  if (finalMotoId && finalClienteId) {
    const { data: motoData } = await supabase
      .from('motos')
      .select('cliente_id')
      .eq('id', finalMotoId)
      .maybeSingle()
    const clienteActual = (motoData as { cliente_id: string | null } | null)?.cliente_id ?? null
    if (clienteActual !== finalClienteId) {
      await supabase.rpc('vincular_moto_cliente', { p_moto_id: finalMotoId, p_cliente_id: finalClienteId })
    }
  }

  return { motoId: finalMotoId, clienteId: finalClienteId }
}
