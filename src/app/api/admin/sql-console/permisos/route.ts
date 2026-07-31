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

  // No usamos upsert(onConflict) porque los índices únicos de esta tabla son
  // PARCIALES (uno para "fila de rol" con usuario_id IS NULL, otro para "fila
  // de excepción por usuario" con usuario_id IS NOT NULL) — Postgres no deja
  // usar ON CONFLICT sobre un índice parcial solo con la lista de columnas,
  // así que hacemos el select-then-insert/update a mano.
  let buscar = supabase.from('sql_console_permisos').select('id').eq('tenant_id', chk.perfil.tenant_id)
  buscar = usuario_id ? buscar.eq('usuario_id', usuario_id) : buscar.eq('rol', rol).is('usuario_id', null)
  const { data: existente, error: errorBuscar } = await buscar.maybeSingle()
  if (errorBuscar) return NextResponse.json({ error: errorBuscar.message }, { status: 500 })

  const { error } = existente
    ? await supabase.from('sql_console_permisos').update(fila).eq('id', existente.id)
    : await supabase.from('sql_console_permisos').insert(fila)
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
