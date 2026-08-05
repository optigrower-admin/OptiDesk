import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

async function getPerfil(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return null
  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = ['gerencia', 'dueno', 'control_total', 'admin'].includes(rolNorm)
  return { userId: user.id, tenantId: perfil.tenant_id as string, esGerencia }
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const usuarioId = req.nextUrl.searchParams.get('usuarioId')
  if (!usuarioId) return NextResponse.json({ error: 'Falta usuarioId' }, { status: 400 })
  if (usuarioId !== perfil.userId && !perfil.esGerencia) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('reportes_programados')
    .select('*').eq('tenant_id', perfil.tenantId).eq('usuario_id', usuarioId).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reportes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const body = await req.json().catch(() => null) as {
    accion?: string; id?: string; usuarioId?: string
    tipoReporte?: 'pipeline' | 'servicio_tecnico'; nombre?: string; asunto?: string
    canalCorreo?: boolean; canalWhatsapp?: boolean
    horaEnvio?: string; frecuencia?: 'diario' | 'semanal' | 'mensual'
    diaSemana?: number | null; diaMes?: number | null
    periodo?: string; modoGerencia?: 'general' | 'por_usuario'
    activo?: boolean
  } | null
  const { accion } = body ?? {}

  if (accion === 'crear') {
    const usuarioId = body?.usuarioId
    if (!usuarioId) return NextResponse.json({ error: 'Falta usuarioId' }, { status: 400 })
    if (usuarioId !== perfil.userId && !perfil.esGerencia) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    if (!body?.tipoReporte || !body.asunto?.trim()) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    if (!body.canalCorreo && !body.canalWhatsapp) return NextResponse.json({ error: 'Elige al menos un canal' }, { status: 400 })

    const { data, error } = await admin.from('reportes_programados').insert({
      tenant_id: perfil.tenantId, usuario_id: usuarioId, tipo_reporte: body.tipoReporte,
      nombre: body.nombre?.trim() || 'Envío', asunto: body.asunto.trim(),
      canal_correo: !!body.canalCorreo, canal_whatsapp: !!body.canalWhatsapp,
      hora_envio: body.horaEnvio || '08:00', frecuencia: body.frecuencia || 'diario',
      dia_semana: body.frecuencia === 'semanal' ? (body.diaSemana ?? 1) : null,
      dia_mes: body.frecuencia === 'mensual' ? (body.diaMes ?? 1) : null,
      periodo: body.periodo || 'hoy', modo_gerencia: body.modoGerencia || 'general',
    }).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ reporte: data })
  }

  if (accion === 'editar' || accion === 'toggle') {
    if (!body?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const { data: existente } = await admin.from('reportes_programados').select('usuario_id').eq('id', body.id).eq('tenant_id', perfil.tenantId).maybeSingle()
    if (!existente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (existente.usuario_id !== perfil.userId && !perfil.esGerencia) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

    const update: Record<string, unknown> = {}
    if (accion === 'toggle') {
      update.activo = body.activo
    } else {
      if (body.nombre !== undefined) update.nombre = body.nombre.trim() || 'Envío'
      if (body.asunto !== undefined) update.asunto = body.asunto.trim()
      if (body.canalCorreo !== undefined) update.canal_correo = body.canalCorreo
      if (body.canalWhatsapp !== undefined) update.canal_whatsapp = body.canalWhatsapp
      if (body.horaEnvio !== undefined) update.hora_envio = body.horaEnvio
      if (body.frecuencia !== undefined) update.frecuencia = body.frecuencia
      if (body.diaSemana !== undefined) update.dia_semana = body.frecuencia === 'semanal' ? body.diaSemana : null
      if (body.diaMes !== undefined) update.dia_mes = body.frecuencia === 'mensual' ? body.diaMes : null
      if (body.periodo !== undefined) update.periodo = body.periodo
      if (body.modoGerencia !== undefined) update.modo_gerencia = body.modoGerencia
      if (body.activo !== undefined) update.activo = body.activo
    }
    const { error } = await admin.from('reportes_programados').update(update).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'eliminar') {
    if (!body?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const { data: existente } = await admin.from('reportes_programados').select('usuario_id').eq('id', body.id).eq('tenant_id', perfil.tenantId).maybeSingle()
    if (!existente) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (existente.usuario_id !== perfil.userId && !perfil.esGerencia) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    const { error } = await admin.from('reportes_programados').delete().eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
