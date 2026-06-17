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

  const { tenant_id } = await req.json()
  if (!tenant_id) return NextResponse.json({ error: 'Falta tenant_id' }, { status: 400 })

  const admin = createAdminClient()

  // Verificar que no tenga ya un sandbox
  const { data: tenant } = await admin
    .from('tenants')
    .select('id, nombre, slug, sandbox_tenant_id')
    .eq('id', tenant_id)
    .single()

  if (!tenant) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  if (tenant.sandbox_tenant_id) {
    return NextResponse.json({ error: 'Esta empresa ya tiene un entorno de prueba' }, { status: 409 })
  }

  // Generar slug único para el sandbox
  const sandboxSlug = `${tenant.slug}-sandbox-${Date.now()}`

  // Crear tenant sandbox con los mismos datos básicos
  const { data: sandboxTenant, error: errCreate } = await admin
    .from('tenants')
    .insert({
      nombre: `[SANDBOX] ${tenant.nombre}`,
      slug: sandboxSlug,
      activo: true,
      es_sandbox: true,
      source_tenant_id: tenant_id,
    })
    .select('id')
    .single()

  if (errCreate || !sandboxTenant) {
    return NextResponse.json({ error: `Error al crear sandbox: ${errCreate?.message}` }, { status: 500 })
  }

  // Vincular el sandbox al tenant original
  await admin
    .from('tenants')
    .update({ sandbox_tenant_id: sandboxTenant.id })
    .eq('id', tenant_id)

  return NextResponse.json({ ok: true, sandbox_tenant_id: sandboxTenant.id })
}
