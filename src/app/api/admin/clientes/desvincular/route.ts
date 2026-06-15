import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/clientes/desvincular
 * Body: { cliente_id }
 *
 * Desvincula un perfil secundario: limpia fusionado_con_id y fusionado_at.
 * Las conversaciones NO se mueven de vuelta — siguen en el cliente destino.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { cliente_id } = await req.json() as { cliente_id: string }
  if (!cliente_id) return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })

  const admin = createAdminClient()

  const { error } = await admin
    .from('clientes')
    .update({ fusionado_con_id: null, fusionado_at: null })
    .eq('id', cliente_id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
