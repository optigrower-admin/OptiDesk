import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/crypto'
import { uploadToR2, getSignedDownloadUrl } from '@/lib/r2'
import { enviarClienteAProgreser } from '@/lib/progreser'

export const maxDuration = 60
export const runtime = 'nodejs'

const CAMPOS_REQUERIDOS = ['primer_nombre', 'primer_apellido', 'cedula', 'celular', 'email', 'fecha_nacimiento'] as const
const CAMPO_LABEL: Record<string, string> = {
  primer_nombre: 'Primer nombre', primer_apellido: 'Primer apellido', cedula: 'Número de cédula',
  celular: 'Celular', email: 'Correo electrónico', fecha_nacimiento: 'Fecha de nacimiento',
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as { cliente_id?: string } | null
  if (!body?.cliente_id) return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })

  const admin = createAdminClient()

  const [{ data: tenant }, { data: cliente }] = await Promise.all([
    admin.from('tenants').select('progreser_usuario, progreser_password_enc').eq('id', perfil.tenant_id).single(),
    admin.from('clientes')
      .select('primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, tipo_documento, cedula, celular, email, fecha_nacimiento')
      .eq('id', body.cliente_id).eq('tenant_id', perfil.tenant_id).single(),
  ])

  if (!tenant?.progreser_usuario || !tenant.progreser_password_enc) {
    return NextResponse.json({ error: 'Progreser no está configurado — ve a Integraciones → Progreser y guarda el usuario/contraseña.' }, { status: 400 })
  }
  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const faltantes = CAMPOS_REQUERIDOS.filter(c => !cliente[c])
  if (faltantes.length) {
    return NextResponse.json({ error: `Faltan datos del cliente para poder enviarlo a Progreser: ${faltantes.map(f => CAMPO_LABEL[f]).join(', ')}.` }, { status: 400 })
  }

  let password: string
  try { password = decrypt(tenant.progreser_password_enc) } catch { return NextResponse.json({ error: 'No se pudo leer la contraseña guardada de Progreser' }, { status: 500 }) }

  const resultado = await enviarClienteAProgreser(tenant.progreser_usuario, password, {
    tipoDocumento: cliente.tipo_documento ?? 'CC',
    numeroDocumento: cliente.cedula!,
    primerNombre: cliente.primer_nombre!,
    segundoNombre: cliente.segundo_nombre ?? undefined,
    primerApellido: cliente.primer_apellido!,
    segundoApellido: cliente.segundo_apellido ?? undefined,
    correo: cliente.email!,
    celular: cliente.celular!,
  })

  const screenshotUrls: { paso: string; url: string }[] = []
  let primerScreenshotKey: string | null = null
  for (const s of resultado.screenshots) {
    try {
      const key = `progreser-debug/${perfil.tenant_id}/${body.cliente_id}/${Date.now()}-${s.paso}.png`
      await uploadToR2(key, s.buffer, 'image/png')
      if (!primerScreenshotKey) primerScreenshotKey = key
      screenshotUrls.push({ paso: s.paso, url: await getSignedDownloadUrl(key, 3600) })
    } catch { /* si falla subir una captura, seguimos con las demás */ }
  }

  await admin.from('progreser_envios').insert({
    tenant_id: perfil.tenant_id, cliente_id: body.cliente_id, usuario_id: user.id,
    exitoso: resultado.ok, mensaje: resultado.mensaje, screenshot_key: primerScreenshotKey,
  })

  return NextResponse.json({ ok: resultado.ok, mensaje: resultado.mensaje, screenshots: screenshotUrls })
}
