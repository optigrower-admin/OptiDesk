import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const { data, error } = await admin.from('tenants').select('repuestos_fecha_corte').eq('id', perfil.tenantId).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ fechaCorte: data?.repuestos_fecha_corte ?? null, puedeEditar: ROLES_EDITA.includes(perfil.rol) })
}

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!ROLES_EDITA.includes(perfil.rol)) {
    return NextResponse.json({ error: 'Solo gerencia puede bloquear o desbloquear repuestos' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { fecha: string | null } | null
  if (body?.fecha !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body?.fecha ?? '')) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('tenants').update({ repuestos_fecha_corte: body?.fecha ?? null }).eq('id', perfil.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
