import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import nodemailer from 'nodemailer'
import { encrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/mensajes/conectar-correo-empresa
 * Body: { email, app_password }
 *
 * Conecta UNA sola cuenta de Gmail para toda la empresa (no por usuario),
 * usada para enviar el resumen diario a todos los colaboradores.
 * Solo gerencia/dueño. Verifica las credenciales contra Gmail antes de guardar.
 */
async function requiereGerencia() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return { error: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) }

  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'
  if (!esGerencia) return { error: NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) }

  return { tenantId: perfil.tenant_id as string }
}

export async function GET() {
  const check = await requiereGerencia()
  if ('error' in check) return check.error

  const admin = createAdminClient()
  const { data } = await admin.from('tenants')
    .select('email_empresa_smtp_usuario, email_empresa_conectado_at')
    .eq('id', check.tenantId).single()

  return NextResponse.json({ conectado: data?.email_empresa_smtp_usuario ?? null, conectadoAt: data?.email_empresa_conectado_at ?? null })
}

export async function POST(req: NextRequest) {
  const check = await requiereGerencia()
  if ('error' in check) return check.error

  const { email, app_password } = await req.json() as { email: string; app_password: string }
  if (!email?.trim() || !app_password?.trim()) {
    return NextResponse.json({ error: 'Faltan el correo o la contraseña de aplicación' }, { status: 400 })
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email.trim(), pass: app_password.trim() },
  })

  try {
    await transporter.verify()
  } catch {
    return NextResponse.json({
      error: 'No se pudo conectar con esas credenciales. Revisa que el correo y la contraseña de aplicación sean correctos.',
    }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('tenants').update({
    email_empresa_smtp_usuario: email.trim(),
    email_empresa_smtp_app_password_enc: encrypt(app_password.trim()),
    email_empresa_conectado_at: new Date().toISOString(),
  }).eq('id', check.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const check = await requiereGerencia()
  if ('error' in check) return check.error

  const admin = createAdminClient()
  const { error } = await admin.from('tenants').update({
    email_empresa_smtp_usuario: null,
    email_empresa_smtp_app_password_enc: null,
    email_empresa_conectado_at: null,
  }).eq('id', check.tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
