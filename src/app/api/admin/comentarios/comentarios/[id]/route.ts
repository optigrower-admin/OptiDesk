import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json() as { estado: string }
  const { estado } = body
  const allowed = ['nuevo', 'visto', 'respondido', 'dm_enviado']
  if (!allowed.includes(estado))
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })

  const admin = createAdminClient()

  // Verify ownership via join to publicaciones
  const { data: comentario } = await admin.from('comentarios')
    .select('id, publicaciones(tenant_id)')
    .eq('id', params.id)
    .maybeSingle()

  const pub = comentario?.publicaciones as Record<string, string> | null
  if (!comentario || pub?.tenant_id !== perfil.tenant_id)
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { data: updated, error } = await admin.from('comentarios')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(updated)
}
