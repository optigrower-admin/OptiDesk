import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { obtenerDatosResumenPipeline, construirResumenPipelineHtml } from '@/lib/ventas/resumenPipelineEmail'

// Vista previa de cómo queda la plantilla del correo — no envía nada, solo
// devuelve el HTML para abrirlo en el navegador (con los datos reales del
// colaborador elegido).
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'
  if (!esGerencia) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const usuarioId = req.nextUrl.searchParams.get('usuarioId')
  if (!usuarioId) return NextResponse.json({ error: 'Falta usuarioId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: usuario } = await admin.from('usuarios').select('id, nombre, tenant_id')
    .eq('id', usuarioId).eq('tenant_id', perfil.tenant_id).maybeSingle()
  if (!usuario) return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 })

  const datos = await obtenerDatosResumenPipeline(admin, perfil.tenant_id, usuarioId, usuario.nombre ?? 'colaborador')
  const html = construirResumenPipelineHtml(datos)

  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><title>Vista previa — Resumen de pipeline</title></head><body style="background:#f9fafb; padding:24px 12px;">${html}</body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
