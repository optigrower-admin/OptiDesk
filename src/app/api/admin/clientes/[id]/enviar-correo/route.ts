import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailComoEmpresa, type AdjuntoCorreo } from '@/lib/email'
import { getSignedDownloadUrl } from '@/lib/r2'
import { downloadFromDrive } from '@/lib/drive'
import { registrarAuditoria } from '@/lib/audit'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/clientes/[id]/enviar-correo
 * Body: { plantilla_id?, destinatario, asunto, cuerpo, documentos_tipos? }
 *
 * Envía un correo (desde el Gmail de la empresa) con los documentos del
 * cliente que coincidan con los tipos pedidos adjuntos, y deja constancia
 * en correos_cliente (pestaña "Correos" de la ficha) sin importar si el
 * envío tuvo éxito o falló.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, nombre').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { plantilla_id, destinatario, asunto, cuerpo, documentos_tipos } = await req.json() as {
    plantilla_id?: string | null
    destinatario: string
    asunto: string
    cuerpo: string
    documentos_tipos?: string[]
  }
  if (!destinatario?.trim() || !asunto?.trim() || !cuerpo?.trim()) {
    return NextResponse.json({ error: 'Faltan asunto, cuerpo o destinatario' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: plantilla } = plantilla_id
    ? await admin.from('plantillas_correo').select('nombre, bloquear_si_falta_documento').eq('id', plantilla_id).eq('tenant_id', perfil.tenant_id).maybeSingle()
    : { data: null }

  // Resolver adjuntos: el archivo más reciente de cada tipo_documento pedido.
  const attachments: AdjuntoCorreo[] = []
  const nombresAdjuntos: string[] = []
  const documentosFaltantes: string[] = []
  for (const tipo of documentos_tipos ?? []) {
    const { data: archivo } = await admin.from('archivos_cliente')
      .select('url, nombre_archivo, storage_location')
      .eq('cliente_id', params.id).eq('tenant_id', perfil.tenant_id).eq('tipo_documento', tipo)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!archivo) { documentosFaltantes.push(tipo); continue }
    const filename = archivo.nombre_archivo ?? `${tipo}.pdf`
    if (archivo.storage_location === 'drive') {
      const { data: tenant } = await admin.from('tenants').select('google_refresh_token').eq('id', perfil.tenant_id).single()
      if (!tenant?.google_refresh_token) continue
      try {
        const buffer = await downloadFromDrive(archivo.url, tenant.google_refresh_token)
        attachments.push({ filename, content: buffer })
        nombresAdjuntos.push(filename)
      } catch { /* si falla, se envía sin ese adjunto */ }
    } else {
      const url = await getSignedDownloadUrl(archivo.url, 3600, filename)
      attachments.push({ filename, path: url })
      nombresAdjuntos.push(filename)
    }
  }

  if (plantilla?.bloquear_si_falta_documento && documentosFaltantes.length > 0) {
    return NextResponse.json({
      error: `Falta subir: ${documentosFaltantes.join(', ')} (pestaña Archivos). Esta plantilla bloquea el envío hasta que estén todos.`,
    }, { status: 400 })
  }

  const cuerpoHtml = cuerpo.replace(/\n/g, '<br>')

  let estado: 'enviado' | 'error' = 'enviado'
  let errorMensaje: string | null = null
  try {
    await sendEmailComoEmpresa(perfil.tenant_id, destinatario, asunto, cuerpoHtml, attachments)
  } catch (e: unknown) {
    estado = 'error'
    errorMensaje = e instanceof Error ? e.message : 'Error al enviar el correo'
  }

  // El cliente de servicio (admin) no tiene permisos de escritura sobre
  // correos_cliente en este proyecto (mismo caso que historial_cambios_cliente) —
  // se usa el cliente autenticado normal, que sí puede insertar (RLS por tenant).
  const { error: errorHistorial } = await supabase.from('correos_cliente').insert({
    cliente_id: params.id,
    tenant_id: perfil.tenant_id,
    plantilla_id: plantilla_id ?? null,
    plantilla_nombre: plantilla?.nombre ?? null,
    destinatario,
    asunto,
    cuerpo,
    adjuntos: nombresAdjuntos,
    enviado_por: user.id,
    estado,
    error_mensaje: errorMensaje,
  })
  if (errorHistorial) console.error('[enviar-correo] No se pudo guardar en el historial:', errorHistorial.message)

  if (estado === 'error') {
    return NextResponse.json({ error: errorMensaje }, { status: 500 })
  }

  await registrarAuditoria(supabase, {
    tenant_id: perfil.tenant_id,
    tabla: 'clientes',
    registro_id: params.id,
    tipo: 'movimiento',
    descripcion: `${perfil.nombre} envió el correo "${asunto}" a ${destinatario}`,
    usuario_id: user.id,
  })

  return NextResponse.json({ ok: true })
}
