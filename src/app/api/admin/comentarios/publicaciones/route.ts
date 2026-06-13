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

  const canal = req.nextUrl.searchParams.get('canal') // 'facebook' | 'instagram' | null

  const admin = createAdminClient()
  const tenantId = perfil.tenant_id

  let query = admin.from('publicaciones')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (canal === 'facebook' || canal === 'instagram') {
    query = query.eq('canal', canal)
  }

  const { data: pubs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!pubs?.length) return NextResponse.json([])

  // Compute nuevos_comentarios for each publication
  const pubIds = pubs.map(p => p.id)
  const { data: nuevosRows } = await admin
    .from('comentarios')
    .select('publicacion_id')
    .in('publicacion_id', pubIds)
    .eq('estado', 'nuevo')

  const nuevosByPub = new Map<string, number>()
  for (const row of nuevosRows ?? []) {
    nuevosByPub.set(row.publicacion_id, (nuevosByPub.get(row.publicacion_id) ?? 0) + 1)
  }

  const result = pubs.map(p => ({
    ...p,
    nuevos_comentarios: nuevosByPub.get(p.id) ?? 0,
  }))

  return NextResponse.json(result)
}
