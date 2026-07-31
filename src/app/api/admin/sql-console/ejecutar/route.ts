import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { resolverAcceso } from '@/lib/sqlConsole/permisos'
import { validarQuery } from '@/lib/sqlConsole/validar'
import { ejecutarPreview } from '@/lib/db/pgReadonly'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const acceso = await resolverAcceso(supabase, perfil.tenant_id, user.id, perfil.rol)
  if (!acceso.puedeAcceder) return NextResponse.json({ error: 'Sin acceso a Consultas SQL' }, { status: 403 })

  const { query } = await req.json()
  if (typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'Falta "query"' }, { status: 400 })
  }

  const validacion = validarQuery(query, {
    paraPreview: true,
    limiteMax: acceso.limiteFilasPreview,
    tablasPermitidas: new Set(acceso.tablasPermitidas),
  })

  const admin = createAdminClient()
  const inicio = Date.now()

  if (!validacion.ok) {
    await admin.from('query_history').insert({
      tenant_id: perfil.tenant_id, usuario_id: user.id, query_text: query,
      status: 'ERROR', error_mensaje: validacion.error, duracion_ms: 0,
    })
    return NextResponse.json({ error: validacion.error }, { status: 400 })
  }

  try {
    const resultado = await ejecutarPreview(user.id, validacion.queryConLimite!)
    const duracionMs = Date.now() - inicio

    await admin.from('query_history').insert({
      tenant_id: perfil.tenant_id, usuario_id: user.id, query_text: query,
      status: 'OK', filas_retornadas: resultado.rowCount ?? 0, duracion_ms: duracionMs,
    })

    return NextResponse.json({
      columnas: resultado.fields.map(f => f.name),
      filas: resultado.rows,
      filasRetornadas: resultado.rowCount ?? 0,
      limitePreview: acceso.limiteFilasPreview,
      duracionMs,
    })
  } catch (err) {
    const duracionMs = Date.now() - inicio
    const esTimeout = err instanceof Error && /timeout/i.test(err.message)
    const mensaje = err instanceof Error ? err.message : 'Error ejecutando la consulta'

    await admin.from('query_history').insert({
      tenant_id: perfil.tenant_id, usuario_id: user.id, query_text: query,
      status: esTimeout ? 'TIMEOUT' : 'ERROR', error_mensaje: mensaje, duracion_ms: duracionMs,
    })

    return NextResponse.json({ error: mensaje }, { status: esTimeout ? 504 : 400 })
  }
}
