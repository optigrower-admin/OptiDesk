import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/motos/cambiar-propietario
 * Body: { moto_id, nuevo_cliente_id }
 *
 * Actualiza motos.cliente_id. El trigger registrar_cambio_propietario
 * cierra el registro anterior en historial_propietarios_moto y abre uno nuevo.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { moto_id, nuevo_cliente_id } = await req.json() as {
    moto_id: string
    nuevo_cliente_id: string
  }
  if (!moto_id || !nuevo_cliente_id)
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const admin = createAdminClient()

  // Verificar que la moto pertenece al tenant
  const { data: moto } = await admin
    .from('motos').select('id').eq('id', moto_id).eq('tenant_id', perfil.tenant_id).single()
  if (!moto) return NextResponse.json({ error: 'Moto no encontrada' }, { status: 404 })

  // Verificar que el nuevo cliente pertenece al tenant
  const { data: cliente } = await admin
    .from('clientes').select('id').eq('id', nuevo_cliente_id).eq('tenant_id', perfil.tenant_id).single()
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  // Actualizar — el trigger maneja el historial automáticamente
  const { error } = await admin
    .from('motos')
    .update({ cliente_id: nuevo_cliente_id, updated_at: new Date().toISOString() })
    .eq('id', moto_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
