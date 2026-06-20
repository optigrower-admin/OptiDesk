import { createClient } from '@/lib/supabase/server'
import nodemailer from 'nodemailer'
import { encrypt } from '@/lib/crypto'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/perfil/conectar-correo
 * Body: { email, app_password }
 *
 * Verifica las credenciales contra Gmail (login real) antes de guardar,
 * para no guardar una contraseña de aplicación inválida sin avisar.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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

  const { error } = await supabase.from('usuarios').update({
    email_smtp_usuario: email.trim(),
    email_smtp_app_password_enc: encrypt(app_password.trim()),
    email_conectado_at: new Date().toISOString(),
  }).eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { error } = await supabase.from('usuarios').update({
    email_smtp_usuario: null,
    email_smtp_app_password_enc: null,
    email_conectado_at: null,
  }).eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
