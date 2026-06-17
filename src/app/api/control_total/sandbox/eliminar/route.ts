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

  const { sandbox_tenant_id } = await req.json()
  if (!sandbox_tenant_id) return NextResponse.json({ error: 'Falta sandbox_tenant_id' }, { status: 400 })

  const admin = createAdminClient()

  // Verificar que es efectivamente un sandbox
  const { data: sandboxTenant } = await admin
    .from('tenants')
    .select('id, es_sandbox, source_tenant_id')
    .eq('id', sandbox_tenant_id)
    .single()

  if (!sandboxTenant) return NextResponse.json({ error: 'Sandbox no encontrado' }, { status: 404 })
  if (!sandboxTenant.es_sandbox) {
    return NextResponse.json({ error: 'Este tenant no es un entorno de prueba' }, { status: 400 })
  }

  // 1. Borrar tablas con FK sin CASCADE primero
  await admin.from('conversaciones').delete().eq('tenant_id', sandbox_tenant_id)
  await admin.from('ventas_motos').delete().eq('tenant_id', sandbox_tenant_id)

  // 2. Llamar al RPC de reset para borrar todos los datos del sandbox
  await supabase.rpc('reset_tenant_data', { p_tenant_id: sandbox_tenant_id, p_modo: 'completo' })

  // 3. Quitar sandbox_tenant_id de los usuarios que lo tenían asignado
  await admin
    .from('usuarios')
    .update({ sandbox_tenant_id: null })
    .eq('sandbox_tenant_id', sandbox_tenant_id)

  // 4. Quitar sandbox_tenant_id del tenant original
  if (sandboxTenant.source_tenant_id) {
    await admin
      .from('tenants')
      .update({ sandbox_tenant_id: null })
      .eq('id', sandboxTenant.source_tenant_id)
  }

  // 5. Eliminar el tenant sandbox
  await admin.from('tenants').delete().eq('id', sandbox_tenant_id)

  return NextResponse.json({ ok: true })
}
