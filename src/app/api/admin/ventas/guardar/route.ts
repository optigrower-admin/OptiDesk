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

  const body = await req.json()
  const { cliente_id, ...campos } = body as Record<string, unknown>
  if (!cliente_id)
    return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })

  // "Asignado a" solo lo puede cambiar Gerencia (o control_total) — se ignora
  // el campo en vez de rechazar toda la petición, así el resto de cambios
  // (ej. etapa) sí se guardan.
  const esGerencia = perfil.rol === 'gerencia' || perfil.rol === 'control_total'
  if ('assigned_to' in campos && !esGerencia) {
    delete campos.assigned_to
  }

  const admin = createAdminClient()

  const { data: cliente } = await admin
    .from('clientes')
    .select('id')
    .eq('id', cliente_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const { error } = await admin
    .from('clientes')
    .update(campos)
    .eq('id', cliente_id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
