import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['gerencia', 'dueno', 'control_total'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json() as {
    nombre: string
    categoria: string
    celulares?: string[]
    correos?: string[]
    links?: string[]
    notas?: string | null
  }

  if (!body.nombre?.trim()) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contactos_internos')
    .insert({
      tenant_id: perfil.tenant_id,
      nombre: body.nombre.trim(),
      categoria: body.categoria?.trim() || 'General',
      celulares: (body.celulares ?? []).filter(Boolean),
      correos: (body.correos ?? []).filter(Boolean),
      links: (body.links ?? []).filter(Boolean),
      notas: body.notas?.trim() || null,
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacto: data })
}
