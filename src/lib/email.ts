import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'

/**
 * Envía un correo usando el Gmail que el propio usuario conectó en su perfil
 * (Mi perfil → Conectar mi correo), vía SMTP con contraseña de aplicación.
 * No depende de ningún proveedor externo ni de verificar un dominio.
 */
export async function sendEmailComoUsuario(usuarioId: string, to: string, subject: string, html: string) {
  const admin = createAdminClient()
  const { data: usuario } = await admin
    .from('usuarios')
    .select('email_smtp_usuario, email_smtp_app_password_enc')
    .eq('id', usuarioId)
    .single()

  if (!usuario?.email_smtp_usuario || !usuario.email_smtp_app_password_enc) {
    throw new Error('Este usuario no ha conectado su correo todavía (Mi perfil → Conectar mi correo)')
  }

  const appPassword = decrypt(usuario.email_smtp_app_password_enc)

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: usuario.email_smtp_usuario, pass: appPassword },
  })

  await transporter.sendMail({
    from: usuario.email_smtp_usuario,
    to,
    subject,
    html,
  })
}
