import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('rol, tenant_id')
    .eq('id', user.id)
    .single()

  if (!perfil || !['control_total', 'admin', 'gerencia'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { user_id } = await req.json()
  if (!user_id) return NextResponse.json({ error: 'Falta user_id' }, { status: 400 })

  // No se puede eliminar a sí mismo
  if (user_id === user.id) {
    return NextResponse.json({ error: 'No puedes eliminar tu propio usuario' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verificar que el target existe y obtener su tenant
  const { data: target } = await supabase
    .from('usuarios')
    .select('id, rol, tenant_id, nombre')
    .eq('id', user_id)
    .single()

  if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  // Admin/gerencia solo puede eliminar usuarios de su propio tenant
  if (perfil.rol !== 'control_total' && target.tenant_id !== perfil.tenant_id) {
    return NextResponse.json({ error: 'No puedes eliminar usuarios de otra empresa' }, { status: 403 })
  }

  // No se puede eliminar un control_total salvo que el ejecutor sea control_total
  if (target.rol === 'control_total' && perfil.rol !== 'control_total') {
    return NextResponse.json({ error: 'No tienes permisos para eliminar este usuario' }, { status: 403 })
  }

  try {
    // Eliminar de la tabla usuarios primero (FK)
    await admin.from('usuarios').delete().eq('id', user_id)
    // Luego eliminar de auth.users
    const { error: authError } = await admin.auth.admin.deleteUser(user_id)
    if (authError) throw new Error(authError.message)

    return NextResponse.json({ ok: true, mensaje: `Usuario "${target.nombre}" eliminado` })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al eliminar: ${msg}` }, { status: 500 })
  }
}
