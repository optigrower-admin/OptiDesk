import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'control_total') {
    return NextResponse.json({ error: 'Solo control_total puede ejecutar esta acción' }, { status: 403 })
  }

  const { tenant_id, confirmar_nombre, modo } = await req.json()
  if (!tenant_id || !confirmar_nombre || !modo) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }
  if (modo !== 'completo' && modo !== 'operativo') {
    return NextResponse.json({ error: 'Modo inválido' }, { status: 400 })
  }

  const { data: tenant } = await supabase.from('tenants').select('nombre').eq('id', tenant_id).single()
  if (!tenant) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  if (tenant.nombre.trim().toLowerCase() !== confirmar_nombre.trim().toLowerCase()) {
    return NextResponse.json({ error: 'El nombre de confirmación no coincide' }, { status: 400 })
  }

  // Borrar tablas que referencian clientes/motos sin CASCADE DELETE antes de
  // llamar al RPC (que sí los elimina), para evitar FK constraint violations.
  // conversaciones.cliente_id → clientes (sin CASCADE) y cascadea a mensajes,
  // conversaciones_etiquetas y leads_campana automáticamente.
  // ventas_motos referencia tanto clientes.id como motos.id (sin CASCADE).
  const admin = createAdminClient()
  await admin.from('conversaciones').delete().eq('tenant_id', tenant_id)
  await admin.from('ventas_motos').delete().eq('tenant_id', tenant_id)

  // La función PostgreSQL corre como SECURITY DEFINER (privilegios postgres),
  // bypassea RLS completamente y maneja todo en una sola transacción atómica.
  const { data: resultado, error } = await supabase.rpc('reset_tenant_data', {
    p_tenant_id: tenant_id,
    p_modo: modo,
  })

  if (error) {
    return NextResponse.json({ error: `Error al reiniciar: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mensaje: resultado })
}
