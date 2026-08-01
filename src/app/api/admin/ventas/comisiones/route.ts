import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES_EDITA = ['gerencia', 'dueno', 'control_total']

async function getPerfil(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return null
  return { userId: user.id, tenantId: perfil.tenant_id as string, rol: (perfil.rol as string ?? '').toLowerCase().replace('ñ', 'n') }
}

export async function GET() {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comisiones_venta')
    .select('id, cilindrada_min, cilindrada_max, comision_valor, orden, updated_at')
    .eq('tenant_id', perfil.tenantId)
    .order('orden')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comisiones: data ?? [], puedeEditar: ROLES_EDITA.includes(perfil.rol) })
}

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!ROLES_EDITA.includes(perfil.rol)) {
    return NextResponse.json({ error: 'Solo gerencia puede editar las comisiones' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { id?: string; comision_valor?: number } | null
  if (!body?.id || body.comision_valor == null || isNaN(body.comision_valor) || body.comision_valor < 0) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('comisiones_venta')
    .update({ comision_valor: body.comision_valor, updated_at: new Date().toISOString(), updated_by: perfil.userId })
    .eq('id', body.id)
    .eq('tenant_id', perfil.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
