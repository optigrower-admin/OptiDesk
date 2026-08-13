import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ROLES_VALIDOS = ['mecanico', 'admin', 'gerencia', 'dueno', 'freelancer', 'asesor_comercial'] as const

async function getTenantId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  return perfil?.tenant_id as string | undefined
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const tenantId = await getTenantId(supabase)
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const etapaId = req.nextUrl.searchParams.get('etapa_id')
  const admin = createAdminClient()
  let query = admin.from('etapas_bloqueo_rol').select('*').eq('tenant_id', tenantId)
  if (etapaId) query = query.eq('etapa_id', etapaId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bloqueos: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const tenantId = await getTenantId(supabase)
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const body = await req.json() as { accion: string; etapa_id?: string; rol?: string; bloqueado?: boolean }
  const { accion } = body

  if (accion === 'set_bloqueo') {
    if (!body.etapa_id || !body.rol) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    if (!ROLES_VALIDOS.includes(body.rol as typeof ROLES_VALIDOS[number]))
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })

    if (body.bloqueado) {
      const { error } = await admin
        .from('etapas_bloqueo_rol')
        .upsert({ tenant_id: tenantId, etapa_id: body.etapa_id, rol: body.rol }, { onConflict: 'etapa_id,rol' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await admin
        .from('etapas_bloqueo_rol').delete()
        .eq('tenant_id', tenantId).eq('etapa_id', body.etapa_id).eq('rol', body.rol)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
