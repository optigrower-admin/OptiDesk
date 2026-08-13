import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { buscarOCrearCliente } from '@/lib/clientes/buscarOCrearCliente'

const GRAPH_VERSION = 'v20.0'
const MAX_MEDIA_BYTES = 4 * 1024 * 1024

export const maxDuration = 30
export const runtime = 'nodejs'

async function decryptToken(enc: string): Promise<string> {
  try {
    const { decrypt } = await import('@/lib/crypto')
    return decrypt(enc)
  } catch {
    return enc
  }
}

interface PlantillaRow {
  id: string
  tenant_id: string
  meta_template_name: string | null
  idioma: string
  cuerpo: string
  variables: string[]
  meta_status: string
  tipo_header: 'texto' | 'imagen' | 'documento' | 'video' | 'ninguno' | null
  header_texto: string | null
}

// Normaliza a formato E.164 sin "+" que usa Meta para WhatsApp — asume Colombia
// (57) cuando el número viene sin código de país.
function normalizarTelefono(raw: string): string {
  const digitos = raw.replace(/\D/g, '')
  if (/^57\d{10}$/.test(digitos)) return digitos
  if (/^3\d{9}$/.test(digitos)) return `57${digitos}`
  return digitos
}

function renderPreview(cuerpo: string, vars: Record<string, string>): string {
  return cuerpo.replace(/\{\{([^}]+)\}\}/g, (_, name) => vars[name.trim()] || `[${name.trim()}]`)
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  // FormData porque las plantillas con header de imagen/video/documento
  // llevan un archivo — para las demás, los mismos campos llegan igual.
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'No se pudo leer la solicitud' }, { status: 400 })
  }

  const plantilla_id = form.get('plantilla_id')?.toString()
  const conversacion_id = form.get('conversacion_id')?.toString() || undefined
  const telefono = form.get('telefono')?.toString() || undefined
  const nombre = form.get('nombre')?.toString() || undefined
  const variables = JSON.parse(form.get('variables')?.toString() || '{}') as Record<string, string>
  const headerFile = form.get('header_media') as File | null

  if (!plantilla_id) return NextResponse.json({ error: 'Falta plantilla_id' }, { status: 400 })
  if (!conversacion_id && !telefono) return NextResponse.json({ error: 'Falta el número de teléfono' }, { status: 400 })

  const admin = createAdminClient()

  const { data: plantilla } = await admin
    .from('plantillas_mensajes')
    .select('id, tenant_id, meta_template_name, idioma, cuerpo, variables, meta_status, tipo_header, header_texto')
    .eq('id', plantilla_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })

  const p = plantilla as unknown as PlantillaRow
  if (p.meta_status !== 'aprobada') {
    return NextResponse.json({ error: 'La plantilla debe estar Aprobada por Meta antes de poder usarla para escribir.' }, { status: 400 })
  }
  if (!p.meta_template_name?.trim()) {
    return NextResponse.json({ error: 'Falta el "Nombre en Meta" de la plantilla' }, { status: 400 })
  }
  const esHeaderMedia = p.tipo_header === 'imagen' || p.tipo_header === 'video' || p.tipo_header === 'documento'
  if (esHeaderMedia && !headerFile) {
    return NextResponse.json({ error: `Esta plantilla necesita un archivo (${p.tipo_header}) para el header.` }, { status: 400 })
  }
  if (esHeaderMedia && headerFile && headerFile.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: `El archivo pesa ${(headerFile.size / 1024 / 1024).toFixed(1)} MB. El máximo soportado es 4 MB.` }, { status: 400 })
  }

  const varsFaltantes = (p.variables ?? []).filter((v) => !variables?.[v]?.trim())
  if (varsFaltantes.length > 0) {
    return NextResponse.json({ error: `Faltan valores para: ${varsFaltantes.join(', ')}` }, { status: 400 })
  }

  const { data: cfg } = await admin
    .from('config_meta')
    .select('wa_phone_number_id, wa_access_token_enc, mensajes_iniciados_hoy, limite_diario_wa, negocio_verificado, limite_reset_at')
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()

  if (!cfg?.wa_phone_number_id || !cfg?.wa_access_token_enc) {
    return NextResponse.json({ error: 'WhatsApp no está conectado. Configúralo en Conexión Meta.' }, { status: 400 })
  }

  // Límite diario de plantillas
  const efectiveLimite = cfg.negocio_verificado ? (cfg.limite_diario_wa ?? 1000) : 250
  const hoyUTC = new Date(); hoyUTC.setUTCHours(0, 0, 0, 0)
  const { count: plantillasHoy } = await admin
    .from('mensajes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', perfil.tenant_id)
    .eq('tipo', 'plantilla')
    .eq('direccion', 'saliente')
    .gte('created_at', hoyUTC.toISOString())
  if ((plantillasHoy ?? 0) >= efectiveLimite - 2) {
    return NextResponse.json({ error: `Límite diario de WhatsApp alcanzado (${plantillasHoy}/${efectiveLimite} plantillas).` }, { status: 429 })
  }

  const token = await decryptToken(cfg.wa_access_token_enc)

  // ── Resolver conversación (existente o nueva) ────────────────────────────
  let convId = conversacion_id ?? null
  let canalContactId: string | null = null

  if (convId) {
    const { data: conv } = await admin
      .from('conversaciones')
      .select('id, canal, canal_contact_id')
      .eq('id', convId)
      .eq('tenant_id', perfil.tenant_id)
      .single()
    if (!conv || conv.canal !== 'whatsapp') {
      return NextResponse.json({ error: 'Conversación no encontrada o no es de WhatsApp' }, { status: 404 })
    }
    canalContactId = conv.canal_contact_id
  } else {
    canalContactId = normalizarTelefono(telefono!)
    if (canalContactId.length < 10) {
      return NextResponse.json({ error: 'Número de teléfono inválido' }, { status: 400 })
    }

    const { cliente } = await buscarOCrearCliente({
      tenantId: perfil.tenant_id,
      canal: 'whatsapp',
      contactId: canalContactId,
      celular: canalContactId,
      nombre: nombre?.trim() || undefined,
      assignedTo: perfil.id,
      enSeguimientoVentas: true,
      etapaVenta: 'nuevo_mensaje',
      etapaVentaOrden: -1,
      nombrePendienteAprobacion: !nombre?.trim(),
      supabaseClient: admin,
    })

    const { data: convExistente } = await admin
      .from('conversaciones')
      .select('id')
      .eq('tenant_id', perfil.tenant_id)
      .eq('canal', 'whatsapp')
      .eq('canal_contact_id', canalContactId)
      .in('estado', ['abierta', 'pendiente'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (convExistente) {
      convId = convExistente.id
      if (cliente?.id) await admin.from('conversaciones').update({ cliente_id: cliente.id }).eq('id', convId)
    } else {
      const { data: nuevaConv, error: errConv } = await admin
        .from('conversaciones')
        .insert({
          tenant_id: perfil.tenant_id,
          canal: 'whatsapp',
          canal_contact_id: canalContactId,
          assigned_to: perfil.id,
          cliente_id: cliente?.id ?? null,
          estado: 'abierta',
        })
        .select('id')
        .single()
      if (errConv || !nuevaConv) return NextResponse.json({ error: 'No se pudo crear la conversación' }, { status: 500 })
      convId = nuevaConv.id
    }
  }

  // ── Si el header lleva media, subirlo primero a la Media API de Meta ────
  // (distinto del "resumable upload" que usa el ejemplo de la plantilla al
  // crearla — para ENVIAR un mensaje se necesita un media id de este otro
  // endpoint, ligado al número de WhatsApp del negocio).
  let headerMediaId: string | null = null
  let headerMediaUrl: string | null = null
  if (esHeaderMedia && headerFile) {
    const buffer = Buffer.from(await headerFile.arrayBuffer())
    const mediaForm = new FormData()
    mediaForm.append('file', new Blob([buffer], { type: headerFile.type }), headerFile.name)
    mediaForm.append('type', headerFile.type)
    mediaForm.append('messaging_product', 'whatsapp')

    const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.wa_phone_number_id}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: mediaForm,
    })
    const uploadData = await uploadRes.json()
    if (!uploadRes.ok || !uploadData?.id) {
      const msg = uploadData?.error?.error_user_msg || uploadData?.error?.message || 'No se pudo subir el archivo del header a Meta'
      return NextResponse.json({ error: msg, code: 'META_ERROR' }, { status: 422 })
    }
    headerMediaId = uploadData.id as string

    // Solo para dejar registro visual del envío en la bandeja (no se le manda a Meta).
    try {
      const { uploadToR2, getSignedDownloadUrl } = await import('@/lib/r2')
      const ext = headerFile.name.split('.').pop() ?? 'bin'
      const r2Key = `mensajes/${perfil.tenant_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      await uploadToR2(r2Key, buffer, headerFile.type)
      headerMediaUrl = await getSignedDownloadUrl(r2Key, 60 * 60 * 24 * 7)
    } catch {
      // No bloquea el envío si falla solo el guardado de la copia visual.
    }
  }

  // ── Armar y enviar el mensaje de plantilla a Meta ────────────────────────
  const components: Record<string, unknown>[] = []

  if (esHeaderMedia && headerMediaId) {
    const tipoMeta = p.tipo_header === 'imagen' ? 'image' : p.tipo_header === 'video' ? 'video' : 'document'
    components.push({
      type: 'header',
      parameters: [{
        type: tipoMeta,
        [tipoMeta]: {
          id: headerMediaId,
          ...(p.tipo_header === 'documento' && headerFile ? { filename: headerFile.name } : {}),
        },
      }],
    })
  }

  const varsOrdenadas = (p.variables ?? []).map((v) => variables![v])
  if (varsOrdenadas.length > 0) {
    components.push({ type: 'body', parameters: varsOrdenadas.map((texto) => ({ type: 'text', text: texto })) })
  }

  const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.wa_phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: canalContactId,
      type: 'template',
      template: {
        name: p.meta_template_name,
        language: { code: p.idioma },
        ...(components.length > 0 ? { components } : {}),
      },
    }),
  })
  const result = await r.json()
  if (!r.ok) {
    const metaMsg = result?.error?.error_user_msg || result?.error?.message || 'Error al enviar la plantilla por WhatsApp'
    return NextResponse.json({ error: metaMsg, code: 'META_ERROR' }, { status: 422 })
  }

  const contenidoRenderizado = renderPreview(p.cuerpo, variables ?? {})
  const now = new Date().toISOString()

  await admin.from('mensajes').insert({
    conversacion_id: convId,
    tenant_id: perfil.tenant_id,
    direccion: 'saliente',
    tipo: 'plantilla',
    contenido: contenidoRenderizado,
    enviado_por: perfil.id,
    meta_message_id: result.messages?.[0]?.id ?? null,
    estado_envio: 'enviado',
    leido_por_asesor: true,
    ...(headerMediaUrl ? { media_url: headerMediaUrl } : {}),
  })

  await admin.from('conversaciones').update({
    ultimo_mensaje_at: now,
    ultimo_mensaje_texto: contenidoRenderizado.slice(0, 100),
    ultimo_mensaje_direccion: 'saliente',
    updated_at: now,
  }).eq('id', convId)

  const mismodia = new Date(cfg.limite_reset_at ?? 0).toDateString() === new Date().toDateString()
  await admin.from('config_meta').update({
    mensajes_iniciados_hoy: mismodia ? (cfg.mensajes_iniciados_hoy ?? 0) + 1 : 1,
    ...(mismodia ? {} : { limite_reset_at: now }),
  }).eq('tenant_id', perfil.tenant_id)

  return NextResponse.json({ ok: true, conversacion_id: convId })
}
