import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarAuditoria } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('rol, tenant_id').eq('id', user.id).single()
  if (!perfil || !['control_total', 'gerencia'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado para crear usuarios' }, { status: 403 })
  }

  const body = await req.json()
  const { nombre, email, password, rol } = body
  let tenant_id = body.tenant_id

  if (perfil.rol === 'gerencia') {
    // Gerencia solo puede crear integrantes dentro de su propia empresa,
    // y nunca con rol control_total (eso es exclusivo de la plataforma).
    tenant_id = perfil.tenant_id
    if (rol === 'control_total') {
      return NextResponse.json({ error: 'No puedes asignar el rol Control Total' }, { status: 403 })
    }
  }

  if (!nombre || !email || !password || !rol || !tenant_id) {
    return NextResponse.json({ error: 'Todos los campos son requeridos' }, { status: 400 })
  }

  // Admin client solo para Auth Admin API (no es PostgREST — sb_secret_* funciona aquí)
  const admin = createAdminClient()
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authUser.user) {
    return NextResponse.json({ error: authError?.message ?? 'Error creando usuario en Auth' }, { status: 400 })
  }

  // INSERT usando el cliente SSR del control_total (su JWT satisface la política superadmin_all_usuarios)
  const { error: profileError } = await supabase.from('usuarios').insert({
    id: authUser.user.id,
    tenant_id,
    nombre,
    email,
    rol,
    activo: true,
  })

  if (profileError) {
    // Revertir usuario de auth si falla el perfil
    await admin.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  await registrarAuditoria(supabase, {
    tenant_id,
    tabla: 'usuarios',
    registro_id: authUser.user.id,
    tipo: 'movimiento',
    valor_nuevo: { nombre, email, rol },
    descripcion: `Creó al integrante "${nombre}" (${rol})`,
    usuario_id: user.id,
  })

  return NextResponse.json({ id: authUser.user.id })
}
