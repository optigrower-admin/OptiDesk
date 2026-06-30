import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('rol, tenant_id').eq('id', user.id).single()
  const rolesPermitidos = ['control_total', 'gerencia', 'dueno', 'admin']
  if (!perfil || !rolesPermitidos.includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const admin = createAdminClient()
    await admin.from('tenants')
      .update({ google_refresh_token: null })
      .eq('id', perfil.tenant_id)
  } catch {
    await supabase.from('tenants')
      .update({ google_refresh_token: null })
      .eq('id', perfil.tenant_id)
  }

  return NextResponse.json({ ok: true })
}
