import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const publicacionId = req.nextUrl.searchParams.get('publicacion_id')
  if (!publicacionId) return NextResponse.json({ error: 'Falta publicacion_id' }, { status: 400 })

  const admin = createAdminClient()

  // Verify the publication belongs to this tenant
  const { data: pub } = await admin.from('publicaciones')
    .select('id')
    .eq('id', publicacionId)
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()
  if (!pub) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 })

  const { data: rows, error } = await admin.from('comentarios')
    .select('*')
    .eq('publicacion_id', publicacionId)
    .eq('es_respuesta', false)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(rows ?? [])
}
