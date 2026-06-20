import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/clientes/vincular
 * Body: { cliente_origen_id, cliente_destino_id }
 *
 * Mueve TODAS las conversaciones, motos y órdenes del cliente_origen
 * al cliente_destino, luego marca el origen como fusionado (será
 * borrado por el cron después de 48h).
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { cliente_origen_id, cliente_destino_id } = await req.json() as {
    cliente_origen_id: string
    cliente_destino_id: string
  }

  if (!cliente_origen_id || !cliente_destino_id)
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  if (cliente_origen_id === cliente_destino_id)
    return NextResponse.json({ error: 'No puedes vincular un cliente consigo mismo' }, { status: 400 })

  const admin = createAdminClient()

  // Verificar que ambos clientes pertenecen al mismo tenant
  const { data: clientes } = await admin
    .from('clientes')
    .select('id, nombre, fusionado_con_id')
    .in('id', [cliente_origen_id, cliente_destino_id])
    .eq('tenant_id', perfil.tenant_id)

  if (!clientes || clientes.length !== 2)
    return NextResponse.json({ error: 'Clientes no encontrados en este tenant' }, { status: 404 })

  const origen = clientes.find(c => c.id === cliente_origen_id)
  if (origen?.fusionado_con_id)
    return NextResponse.json({ error: 'Este cliente ya fue fusionado anteriormente' }, { status: 400 })

  // 1. Mover conversaciones
  await admin.from('conversaciones')
    .update({ cliente_id: cliente_destino_id })
    .eq('cliente_id', cliente_origen_id)
    .eq('tenant_id', perfil.tenant_id)

  // 2. Mover motos
  await admin.from('motos')
    .update({ cliente_id: cliente_destino_id })
    .eq('cliente_id', cliente_origen_id)
    .eq('tenant_id', perfil.tenant_id)

  // 3. Mover órdenes
  await admin.from('ordenes')
    .update({ cliente_id: cliente_destino_id })
    .eq('cliente_id', cliente_origen_id)
    .eq('tenant_id', perfil.tenant_id)

  // 3b. Mover datos de Seguimiento Ventas (archivos, comentarios, pasos, recordatorios,
  //     motos de interés, estudio de crédito, visibilidad). Las que tengan UNIQUE(cliente_id, x)
  //     pueden chocar si el destino ya tiene esa misma fila — se ignora el error en ese caso.
  await admin.from('archivos_cliente').update({ cliente_id: cliente_destino_id }).eq('cliente_id', cliente_origen_id)
  await admin.from('comentarios_cliente').update({ cliente_id: cliente_destino_id }).eq('cliente_id', cliente_origen_id)
  await admin.from('clientes_pasos').update({ cliente_id: cliente_destino_id }).eq('cliente_id', cliente_origen_id)
  await admin.from('recordatorios').update({ cliente_id: cliente_destino_id }).eq('cliente_id', cliente_origen_id)
  for (const tabla of ['clientes_motos_interes', 'clientes_credito_estudio', 'clientes_visibilidad'] as const) {
    const { data: filas } = await admin.from(tabla).select('id').eq('cliente_id', cliente_origen_id)
    for (const fila of filas ?? []) {
      await admin.from(tabla).update({ cliente_id: cliente_destino_id }).eq('id', fila.id)
    }
  }

  // 4. Marcar origen como fusionado (se borrará en 48h por el cron)
  const { error } = await admin.from('clientes')
    .update({
      fusionado_con_id: cliente_destino_id,
      fusionado_at:     new Date().toISOString(),
    })
    .eq('id', cliente_origen_id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, cliente_id: cliente_destino_id })
}
