import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json()
  const { conversacion_id, ...campos } = body as Record<string, unknown>
  if (!conversacion_id)
    return NextResponse.json({ error: 'Falta conversacion_id' }, { status: 400 })

  const admin = createAdminClient()

  // Verify conversation belongs to this tenant
  const { data: conv } = await admin
    .from('conversaciones')
    .select('id')
    .eq('id', conversacion_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  const { error } = await admin
    .from('conversaciones')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', conversacion_id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
