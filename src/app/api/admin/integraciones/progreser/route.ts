import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/crypto'

const ROLES_EDITA = ['gerencia', 'dueno', 'control_total']

async function getPerfil(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return null
  return { tenantId: perfil.tenant_id as string, rol: (perfil.rol as string ?? '').toLowerCase().replace('ñ', 'n') }
}

export async function GET() {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin.from('tenants').select('progreser_usuario').eq('id', perfil.tenantId).single()
  return NextResponse.json({ usuario: data?.progreser_usuario ?? null, puedeEditar: ROLES_EDITA.includes(perfil.rol) })
}

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!ROLES_EDITA.includes(perfil.rol)) return NextResponse.json({ error: 'Solo gerencia puede configurar esto' }, { status: 403 })

  const body = await req.json().catch(() => null) as { usuario?: string; password?: string } | null
  if (!body?.usuario?.trim() || !body.password?.trim()) {
    return NextResponse.json({ error: 'Falta usuario o contraseña' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('tenants').update({
    progreser_usuario: body.usuario.trim(),
    progreser_password_enc: encrypt(body.password.trim()),
  }).eq('id', perfil.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
