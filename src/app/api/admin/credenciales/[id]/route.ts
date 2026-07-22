import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function auth(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? '')) return null
  return perfil
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const perfil = await auth(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json() as {
    nombre: string
    categoria: string
    usuario: string | null
    password: string
    link: string | null
    notas: string | null
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('credenciales')
    .insert({ ...body, tenant_id: perfil.tenant_id })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cred: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const perfil = await auth(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json() as Record<string, unknown>
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('credenciales')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('tenant_id', perfil.tenant_id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cred: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const perfil = await auth(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('credenciales')
    .delete()
    .eq('id', params.id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
