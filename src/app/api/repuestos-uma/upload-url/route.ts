import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('rol, tenant_id')
    .eq('id', user.id)
    .single()

  if (!perfil || !['control_total', 'gerencia', 'admin'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permiso para importar catálogo' }, { status: 403 })
  }

  const tenantId = perfil.tenant_id as string
  if (!tenantId) return NextResponse.json({ error: 'Sin tenant asociado' }, { status: 400 })

  const { filename } = await req.json()
  const ext = String(filename ?? '').split('.').pop()?.toLowerCase() || 'xlsx'
  const path = `${tenantId}/repuestos-${Date.now()}.${ext}`

  const admin = createAdminClient()
  await admin.storage.createBucket('catalogos-temp', { public: false }).catch(() => {})

  const { data, error } = await admin.storage.from('catalogos-temp').createSignedUploadUrl(path)
  if (error || !data) {
    return NextResponse.json({ error: 'No se pudo preparar la subida' }, { status: 500 })
  }

  return NextResponse.json({ path: data.path, token: data.token })
}
