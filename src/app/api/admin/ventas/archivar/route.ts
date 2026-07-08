import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const esGerencia = perfil.rol === 'gerencia' || perfil.rol === 'control_total'
  if (!esGerencia) return NextResponse.json({ error: 'Solo Gerencia puede archivar clientes' }, { status: 403 })

  const { cliente_id } = await req.json() as { cliente_id: string }
  if (!cliente_id) return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })

  const admin = createAdminClient()

  // Verificar que el cliente pertenece al tenant
  const { data: cliente } = await admin
    .from('clientes')
    .select('id')
    .eq('id', cliente_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Soft delete: sacar de seguimiento sin borrar el registro
  const { error } = await admin
    .from('clientes')
    .update({ en_seguimiento_ventas: false })
    .eq('id', cliente_id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Registro de auditoría
  await admin.from('auditoria').insert({
    tenant_id:  perfil.tenant_id,
    usuario_id: perfil.id,
    accion:     'archivar_cliente_ventas',
    tabla:      'clientes',
    registro_id: cliente_id,
    detalle:    'Cliente archivado desde Seguimiento Ventas (en_seguimiento_ventas = false)',
  }).then(() => {/* ignorar error si tabla no existe */})

  return NextResponse.json({ ok: true })
}
