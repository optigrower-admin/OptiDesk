import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { registrarAuditoria } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/clientes/[id]/enviar-correo
 * Body: { plantilla_id, destinatario_email }
 *
 * Cualquier rol puede usar una plantilla creada por Gerencia para
 * enviarle un correo puntual al cliente (no ligado a un recordatorio).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, nombre').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { plantilla_id, destinatario_email } = await req.json() as { plantilla_id: string; destinatario_email: string }
  if (!plantilla_id || !destinatario_email) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const [{ data: plantilla }, { data: cliente }] = await Promise.all([
    supabase.from('plantillas_correo').select('asunto, cuerpo_html').eq('id', plantilla_id).eq('tenant_id', perfil.tenant_id).single(),
    supabase.from('clientes').select('nombre').eq('id', params.id).eq('tenant_id', perfil.tenant_id).single(),
  ])
  if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const reemplazar = (s: string) => s.replace(/{{\s*nombre_cliente\s*}}/g, cliente.nombre ?? '')
  const asunto = reemplazar(plantilla.asunto)
  const cuerpo = reemplazar(plantilla.cuerpo_html)

  try {
    await sendEmail(destinatario_email, asunto, cuerpo)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al enviar el correo' }, { status: 500 })
  }

  await supabase.from('comentarios_cliente').insert({
    cliente_id: params.id,
    tenant_id: perfil.tenant_id,
    texto: `✉️ Envió el correo "${asunto}" a ${destinatario_email}`,
    autor_id: user.id,
  })

  await registrarAuditoria(supabase, {
    tenant_id: perfil.tenant_id,
    tabla: 'clientes',
    registro_id: params.id,
    tipo: 'movimiento',
    descripcion: `${perfil.nombre} envió el correo "${asunto}" a ${destinatario_email}`,
    usuario_id: user.id,
  })

  return NextResponse.json({ ok: true })
}
