import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolverAcceso } from '@/lib/sqlConsole/permisos'
import { validarQuery } from '@/lib/sqlConsole/validar'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('export_jobs').select('*')
    .eq('usuario_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ exports: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const acceso = await resolverAcceso(supabase, perfil.tenant_id, user.id, perfil.rol)
  if (!acceso.puedeAcceder) return NextResponse.json({ error: 'Sin acceso a Consultas SQL' }, { status: 403 })
  if (!acceso.puedeExportar) return NextResponse.json({ error: 'No tienes permiso para exportar' }, { status: 403 })

  const { query, formato } = await req.json()
  if (typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'Falta "query"' }, { status: 400 })
  }
  if (!['csv', 'xlsx', 'json', 'txt'].includes(formato)) {
    return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
  }

  // La exportación no lleva el LIMIT 500 del preview (trae todo), pero sí
  // pasa por la misma validación de SELECT/WITH + palabras prohibidas + whitelist.
  const validacion = validarQuery(query, {
    paraPreview: false,
    limiteMax: 0,
    tablasPermitidas: new Set(acceso.tablasPermitidas),
  })
  if (!validacion.ok) return NextResponse.json({ error: validacion.error }, { status: 400 })

  const { data: job, error } = await supabase
    .from('export_jobs')
    .insert({ tenant_id: perfil.tenant_id, usuario_id: user.id, query_text: query, formato, status: 'PENDIENTE' })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dispara el procesamiento en segundo plano (fire-and-forget); el usuario
  // hace polling de GET /exportar/[id] para ver cuándo queda LISTO.
  const origen = req.nextUrl.origin
  fetch(`${origen}/api/admin/sql-console/exportar/procesar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({ jobId: job.id }),
  }).catch(() => {})

  return NextResponse.json({ job })
}
