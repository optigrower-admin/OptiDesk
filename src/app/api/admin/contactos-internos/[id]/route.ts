import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function auth(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['gerencia', 'dueno', 'control_total'].includes(perfil.rol)) return null
  return perfil
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const perfil = await auth(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json() as {
    nombre?: string
    categoria?: string
    celulares?: string[]
    correos?: string[]
    links?: string[]
    notas?: string | null
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.nombre !== undefined) updates.nombre = body.nombre.trim()
  if (body.categoria !== undefined) updates.categoria = body.categoria.trim() || 'General'
  if (body.celulares !== undefined) updates.celulares = body.celulares.filter(Boolean)
  if (body.correos !== undefined) updates.correos = body.correos.filter(Boolean)
  if (body.links !== undefined) updates.links = body.links.filter(Boolean)
  if (body.notas !== undefined) updates.notas = body.notas?.trim() || null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('contactos_internos')
    .update(updates)
    .eq('id', params.id).eq('tenant_id', perfil.tenant_id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ contacto: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const perfil = await auth(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('contactos_internos')
    .delete()
    .eq('id', params.id).eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
