import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarOCrearCliente } from '@/lib/clientes/buscarOCrearCliente'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/clientes/iniciar-seguimiento
 * Body: { nombre, cedula?, celular? }
 *
 * Busca un cliente existente por cédula/celular (mismo criterio que
 * buscarOCrearCliente) o crea uno nuevo, y lo marca para Seguimiento Ventas.
 * Para clientes gestionados en persona, sin chat previo.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { nombre, cedula, celular } = await req.json() as { nombre: string; cedula?: string | null; celular?: string | null }
  if (!nombre?.trim()) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })

  const { cliente } = await buscarOCrearCliente({
    tenantId: perfil.tenant_id, nombre, cedula: cedula ?? undefined, celular: celular ?? undefined,
  })
  if (!cliente) return NextResponse.json({ error: 'No se pudo crear el cliente' }, { status: 500 })

  const admin = createAdminClient()
  const { error } = await admin.from('clientes')
    .update({ en_seguimiento_ventas: true })
    .eq('id', cliente.id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, cliente_id: cliente.id })
}
