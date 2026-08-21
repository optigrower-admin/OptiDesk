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
  return { userId: user.id, tenantId: perfil.tenant_id as string, rol: (perfil.rol as string ?? '').toLowerCase().replace('ñ', 'n') }
}

export async function GET() {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agentes_ia')
    .select('id, nombre, descripcion, proveedor, modelo, integracion_ia_id, herramientas_habilitadas, activo, created_at, prompt_sistema, instrucciones, respuesta_multimensaje')
    .eq('tenant_id', perfil.tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agentes: data ?? [], puedeEditar: ROLES_EDITA.includes(perfil.rol), catalogoHerramientas: Object.values(CATALOGO_HERRAMIENTAS).map(h => ({ nombre: h.nombre, descripcion: h.descripcion })) })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!ROLES_EDITA.includes(perfil.rol)) return NextResponse.json({ error: 'Solo gerencia puede crear agentes' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    nombre?: string; descripcion?: string; prompt_sistema?: string; instrucciones?: string
    integracion_ia_id?: string | null; herramientas_habilitadas?: string[]
    temperatura?: number; max_tokens?: number; modelo?: string | null
    respuesta_multimensaje?: boolean
  } | null
  if (!body?.nombre?.trim()) return NextResponse.json({ error: 'Falta el nombre del agente' }, { status: 400 })
  if (!body.integracion_ia_id) return NextResponse.json({ error: 'Selecciona qué integración de IA va a usar este agente' }, { status: 400 })

  const herramientas = (body.herramientas_habilitadas ?? []).filter(h => h in CATALOGO_HERRAMIENTAS)

  const admin = createAdminClient()
  // proveedor/modelo legacy quedan sin usar cuando hay integracion_ia_id, pero
  // la columna proveedor es NOT NULL con CHECK — se guarda un valor válido fijo.
  const { data, error } = await admin.from('agentes_ia').insert({
    tenant_id: perfil.tenantId,
    nombre: body.nombre.trim(),
    descripcion: body.descripcion?.trim() || null,
    proveedor: 'openai',
    integracion_ia_id: body.integracion_ia_id,
    modelo: body.modelo?.trim() || null,
    prompt_sistema: body.prompt_sistema?.trim() || null,
    instrucciones: body.instrucciones?.trim() || null,
    herramientas_habilitadas: herramientas,
    respuesta_multimensaje: body.respuesta_multimensaje ?? false,
    temperatura: body.temperatura ?? 0.7,
    max_tokens: body.max_tokens ?? 800,
    activo: true,
    creado_por: perfil.userId,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
