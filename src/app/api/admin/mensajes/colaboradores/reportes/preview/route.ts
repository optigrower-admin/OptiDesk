import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { calcularPeriodoReporte, type PeriodoReporte } from '@/lib/reportes/periodo'
import { obtenerSeccionesPipeline, construirPipelineHtml } from '@/lib/reportes/resumenPipeline'
import { obtenerSeccionesServicioTecnico, construirServicioTecnicoHtml } from '@/lib/reportes/resumenServicioTecnico'

// Vista previa del HTML del correo — no envía nada.
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = ['gerencia', 'dueno', 'control_total', 'admin'].includes(rolNorm)

  const params = req.nextUrl.searchParams
  const usuarioId = params.get('usuarioId')
  const tipoReporte = params.get('tipoReporte') as 'pipeline' | 'servicio_tecnico' | null
  const periodo = (params.get('periodo') as PeriodoReporte | null) ?? 'hoy'
  const modoGerencia = (params.get('modoGerencia') as 'general' | 'por_usuario' | null) ?? 'general'

  if (!usuarioId || !tipoReporte) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  if (usuarioId !== user.id && !esGerencia) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const { data: usuario } = await admin.from('usuarios').select('id, nombre, rol, reportes_ve_todo_pipeline, reportes_ve_todo_st')
    .eq('id', usuarioId).eq('tenant_id', perfil.tenant_id).maybeSingle()
  if (!usuario) return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 })

  const { desdeISO, hastaISO } = calcularPeriodoReporte(periodo)
  const nombreUsuario = usuario.nombre ?? 'colaborador'
  const reportesVeTodo = tipoReporte === 'pipeline' ? usuario.reportes_ve_todo_pipeline : usuario.reportes_ve_todo_st
  const perfilUsuario = { id: usuario.id, nombre: nombreUsuario, rol: usuario.rol, reportesVeTodo }

  const html = tipoReporte === 'pipeline'
    ? construirPipelineHtml(await obtenerSeccionesPipeline(admin, perfil.tenant_id, perfilUsuario, modoGerencia), nombreUsuario)
    : construirServicioTecnicoHtml(await obtenerSeccionesServicioTecnico(admin, perfil.tenant_id, perfilUsuario, desdeISO, hastaISO, modoGerencia), periodo, nombreUsuario)

  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><title>Vista previa</title></head><body style="background:#f9fafb; padding:24px 12px;">${html}</body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
