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
        kilometraje: motoExtras?.kilometraje ? parseInt(motoExtras.kilometraje.replace(/\./g, '')) : null,
      })
      .select('id')
      .single()
    finalMotoId = data?.id ?? null
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
        // Actualizar solo campos que vienen con valor (no pisar con vacíos)
        const updateData: Record<string, string | null> = {}
        if (clienteNombre) updateData.nombre = clienteNombre
        if (celular)       updateData.celular = celular
        if (Object.keys(updateData).length > 0) {
          await supabase.from('clientes').update(updateData).eq('id', finalClienteId)
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
  if (finalMotoId && finalClienteId) {
    const { data: motoData } = await supabase
      .from('motos')
      .select('cliente_id')
      .eq('id', finalMotoId)
      .maybeSingle()
    const clienteActual = (motoData as { cliente_id: string | null } | null)?.cliente_id ?? null
    if (clienteActual !== finalClienteId) {
      await supabase.from('motos').update({ cliente_id: finalClienteId }).eq('id', finalMotoId)
    }
  }

  return { motoId: finalMotoId, clienteId: finalClienteId }
}
