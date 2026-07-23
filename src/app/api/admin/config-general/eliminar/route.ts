import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteFromR2 } from '@/lib/r2'

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('tenant_id, rol')
    .eq('id', user.id)
    .single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })
  if (perfil.rol !== 'gerencia' && perfil.rol !== 'dueno')
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const seccion = req.nextUrl.searchParams.get('seccion')
  if (!seccion) return NextResponse.json({ error: 'Falta sección' }, { status: 400 })

  const admin = createAdminClient()
  const { data: tenant } = await admin
    .from('tenants')
    .select('manuales_config')
    .eq('id', perfil.tenant_id)
    .single()

  const config = (tenant?.manuales_config ?? {}) as Record<string, string>
  const key = config[seccion]
  if (key) await deleteFromR2(key).catch(() => {})

  delete config[seccion]
  await admin.from('tenants').update({ manuales_config: config }).eq('id', perfil.tenant_id)

  return NextResponse.json({ ok: true })
}
