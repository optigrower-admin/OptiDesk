import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function requireGerencia(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['gerencia', 'control_total'].includes(perfil.rol)) {
    return { error: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) } as const
  }
  return { user, perfil } as const
}

export async function GET() {
  const supabase = createClient()
  const chk = await requireGerencia(supabase)
  if ('error' in chk) return chk.error

  const [{ data: permisos }, { data: usuarios }] = await Promise.all([
    supabase.from('sql_console_permisos').select('*').eq('tenant_id', chk.perfil.tenant_id),
    supabase.from('usuarios').select('id, nombre, rol').eq('tenant_id', chk.perfil.tenant_id),
  ])

  return NextResponse.json({ permisos: permisos ?? [], usuarios: usuarios ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const chk = await requireGerencia(supabase)
  if ('error' in chk) return chk.error

  const body = await req.json()
  const { usuario_id, rol, puede_acceder, tablas_permitidas, puede_exportar, limite_filas_preview } = body

  if (!rol) return NextResponse.json({ error: 'Falta "rol"' }, { status: 400 })

  const fila = {
    tenant_id: chk.perfil.tenant_id,
    usuario_id: usuario_id ?? null,
    rol,
    puede_acceder: !!puede_acceder,
    tablas_permitidas: Array.isArray(tablas_permitidas) ? tablas_permitidas : [],
    puede_exportar: puede_exportar ?? true,
    limite_filas_preview: limite_filas_preview ?? 500,
    updated_at: new Date().toISOString(),
  }

  const onConflict = usuario_id ? 'tenant_id,usuario_id' : 'tenant_id,rol'
  const { error } = await supabase.from('sql_console_permisos').upsert(fila, { onConflict })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const chk = await requireGerencia(supabase)
  if ('error' in chk) return chk.error

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta "id"' }, { status: 400 })

  const { error } = await supabase
    .from('sql_console_permisos').delete()
    .eq('id', id).eq('tenant_id', chk.perfil.tenant_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
