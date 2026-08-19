import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'

export type AdjuntoCorreo = { filename: string; content?: Buffer; path?: string }

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

/**
 * Envía un correo usando el Gmail de la EMPRESA (una sola cuenta compartida por
 * tenant, conectada una vez en Bot Colaboradores → Correo de la empresa).
 * A diferencia de sendEmailComoUsuario, no depende de que cada persona conecte
 * su propio Gmail — útil para notificaciones internas como el resumen diario.
 */
export async function sendEmailComoEmpresa(
  tenantId: string, to: string, subject: string, html: string, attachments?: AdjuntoCorreo[],
) {
  const admin = createAdminClient()
  const { data: tenant } = await admin
    .from('tenants')
    .select('email_empresa_smtp_usuario, email_empresa_smtp_app_password_enc')
    .eq('id', tenantId)
    .single()

  if (!tenant?.email_empresa_smtp_usuario || !tenant.email_empresa_smtp_app_password_enc) {
    throw new Error('La empresa no ha conectado su correo todavía (Bot Colaboradores → Correo de la empresa)')
  }

  const appPassword = decrypt(tenant.email_empresa_smtp_app_password_enc)

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: tenant.email_empresa_smtp_usuario, pass: appPassword },
  })

  await transporter.sendMail({
    from: tenant.email_empresa_smtp_usuario,
    to,
    subject,
    html,
    attachments,
  })
}
