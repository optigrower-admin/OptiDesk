import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })
  if (!['gerencia', 'admin', 'control_total'].includes(perfil.rol ?? '')) {
    return NextResponse.json({ error: 'Sin permisos — se requiere rol gerencia' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: cot } = await admin.from('cotizaciones')
    .select('id, tenant_id').eq('id', params.id).single()

  if (!cot || cot.tenant_id !== perfil.tenant_id) {
    return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }

  await admin.from('cotizaciones').delete().eq('id', params.id)
  return NextResponse.json({ ok: true })
}
