import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CATALOGO_HERRAMIENTAS } from '@/lib/ia/herramientasAgente'

const ROLES_EDITA = ['admin', 'gerencia', 'dueno', 'control_total']

async function getPerfil(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return null
  return { tenantId: perfil.tenant_id as string, rol: (perfil.rol as string ?? '').toLowerCase().replace('ñ', 'n') }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!ROLES_EDITA.includes(perfil.rol)) return NextResponse.json({ error: 'Solo gerencia puede editar agentes' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    nombre?: string; descripcion?: string | null; prompt_sistema?: string | null; instrucciones?: string | null
    integracion_ia_id?: string | null; herramientas_habilitadas?: string[]
    temperatura?: number; max_tokens?: number; activo?: boolean; modelo?: string | null
  } | null
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.nombre !== undefined) update.nombre = body.nombre.trim()
  if (body.descripcion !== undefined) update.descripcion = body.descripcion?.trim() || null
  if (body.prompt_sistema !== undefined) update.prompt_sistema = body.prompt_sistema?.trim() || null
  if (body.instrucciones !== undefined) update.instrucciones = body.instrucciones?.trim() || null
  if (body.integracion_ia_id !== undefined) update.integracion_ia_id = body.integracion_ia_id
  if (body.modelo !== undefined) update.modelo = body.modelo?.trim() || null
  if (body.herramientas_habilitadas !== undefined) update.herramientas_habilitadas = body.herramientas_habilitadas.filter(h => h in CATALOGO_HERRAMIENTAS)
  if (body.temperatura !== undefined) update.temperatura = body.temperatura
  if (body.max_tokens !== undefined) update.max_tokens = body.max_tokens
  if (body.activo !== undefined) update.activo = body.activo

  const admin = createAdminClient()
  const { error } = await admin.from('agentes_ia').update(update).eq('id', params.id).eq('tenant_id', perfil.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!ROLES_EDITA.includes(perfil.rol)) return NextResponse.json({ error: 'Solo gerencia puede eliminar agentes' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.from('agentes_ia').delete().eq('id', params.id).eq('tenant_id', perfil.tenantId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
