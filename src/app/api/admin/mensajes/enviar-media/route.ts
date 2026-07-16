import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadToR2, getSignedDownloadUrl } from '@/lib/r2'
import { decrypt } from '@/lib/crypto'

export const maxDuration = 60

// POST /api/admin/mensajes/enviar-media
// Estrategia para WhatsApp:
//   1. Subir buffer al endpoint /media de Meta → obtener media_id
//   2. Enviar mensaje con {image:{id:media_id}} (Meta accede desde sus propios servidores)
//   3. Guardar en R2 solo para display interno (URL firmada 7 días)
// Estrategia para Messenger:
//   1. Subir a R2 → URL firmada → enviar vía attachment

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })

  const tenantId: string = perfil.tenant_id

  const form = await req.formData()
  const conversacionId = form.get('conversacion_id')?.toString()
  const tipo           = (form.get('tipo')?.toString() ?? 'imagen') as 'imagen' | 'documento' | 'audio' | 'video'
  const caption        = form.get('caption')?.toString() ?? ''
  const file           = form.get('file') as File | null

  if (!conversacionId || !file) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const { data: conv } = await supabase
    .from('conversaciones')
    .select('id, canal, canal_contact_id')
    .eq('id', conversacionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  // ── Subir a R2 para display interno ───────────────────────────────────────
  const ext    = file.name.split('.').pop() ?? 'bin'
  const r2Key  = `mensajes/${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const arrayBuf = await file.arrayBuffer()
  const buffer   = Buffer.from(arrayBuf)

  await uploadToR2(r2Key, buffer, file.type)

  // URL firmada con expiración larga para mostrar en la bandeja (7 días)
  const displayUrl = await getSignedDownloadUrl(r2Key, 60 * 60 * 24 * 7)

  // Obtener credenciales Meta
  const { data: cfg } = await supabase
    .from('config_meta')
    .select('wa_access_token_enc, wa_phone_number_id, messenger_access_token_enc')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  let metaMessageId: string | null = null
  let enviado = false

  // ── WhatsApp: subir a Meta media API → usar media_id ─────────────────────
  // Meta descarga el archivo desde sus propios servidores. Evita el problema
  // de URLs privadas de R2 que Meta no puede descargar desde el exterior.
  if (conv.canal === 'whatsapp' && cfg?.wa_access_token_enc && cfg.wa_phone_number_id) {
    let token = cfg.wa_access_token_enc
    try { token = decrypt(token) } catch { /* dev env sin cifrado */ }

    // 1. Subir el archivo a Meta Media API
    const mediaForm = new FormData()
    mediaForm.append('file', new Blob([buffer], { type: file.type }), file.name)
    mediaForm.append('type', file.type)
    mediaForm.append('messaging_product', 'whatsapp')

    const uploadRes = await fetch(
      `https://graph.facebook.com/v20.0/${cfg.wa_phone_number_id}/media`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: mediaForm }
    )

    if (!uploadRes.ok) {
      const err = await uploadRes.json() as { error?: { message?: string } }
      return NextResponse.json({ error: `Error subiendo a Meta: ${err.error?.message ?? uploadRes.status}` }, { status: 422 })
    }

    const uploadData = await uploadRes.json() as { id?: string }
    const mediaId = uploadData.id

    if (!mediaId) {
      return NextResponse.json({ error: 'Meta no devolvió media_id' }, { status: 422 })
    }

    // 2. Enviar el mensaje con el media_id (Meta lo sirve desde sus CDN)
    const tipoMeta = tipo === 'imagen' ? 'image' : tipo === 'documento' ? 'document' : tipo === 'audio' ? 'audio' : 'video'
    const msgBody: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: conv.canal_contact_id,
      type: tipoMeta,
      [tipoMeta]: {
        id: mediaId,
        ...(caption ? { caption } : {}),
        ...(tipo === 'documento' ? { filename: file.name } : {}),
      },
    }

    const sendRes = await fetch(
      `https://graph.facebook.com/v20.0/${cfg.wa_phone_number_id}/messages`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(msgBody) }
    )

    if (sendRes.ok) {
      const d = await sendRes.json() as { messages?: [{ id: string }] }
      metaMessageId = d.messages?.[0]?.id ?? null
      enviado = true
    } else {
      const err = await sendRes.json() as { error?: { message?: string } }
      return NextResponse.json({ error: err.error?.message ?? 'Error enviando mensaje WA' }, { status: 422 })
    }
  }

  // ── Messenger: enviar con URL firmada ────────────────────────────────────
  // Messenger sí puede acceder a URLs externas firmadas (no tiene el mismo
  // problema que WA con R2 privado).
  if (conv.canal === 'messenger' && cfg?.messenger_access_token_enc) {
    let token = cfg.messenger_access_token_enc
    try { token = decrypt(token) } catch { /* dev */ }

    const tipoMeta = tipo === 'imagen' ? 'image' : tipo === 'audio' ? 'audio' : tipo === 'video' ? 'video' : 'file'

    // Para Messenger usamos la URL firmada (válida 7 días)
    const r = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: conv.canal_contact_id },
        message: { attachment: { type: tipoMeta, payload: { url: displayUrl, is_reusable: true } } },
      }),
    })

    if (r.ok) {
      const d = await r.json() as { message_id?: string }
      metaMessageId = d.message_id ?? null
      enviado = true
    }
  }

  // ── Registrar en DB ───────────────────────────────────────────────────────
  const { data: msgDb } = await supabase.from('mensajes').insert({
    conversacion_id: conversacionId,
    tenant_id:       tenantId,
    direccion:       'saliente',
    tipo,
    contenido:       caption || file.name,
    meta_message_id: metaMessageId,
    enviado_por:     user.id,
    estado_envio:    enviado ? 'enviado' : 'pendiente',
    leido_por_asesor: true,
    media_url:       displayUrl,
  }).select('id, conversacion_id, direccion, tipo, contenido, enviado_por, estado_envio, created_at, leido_por_asesor, media_url').single()

  await supabase.from('conversaciones').update({
    ultimo_mensaje_at:       new Date().toISOString(),
    ultimo_mensaje_texto:    `[${tipo}] ${caption || file.name}`.slice(0, 100),
    ultimo_mensaje_direccion: 'saliente',
  }).eq('id', conversacionId)

  return NextResponse.json({ mensaje: msgDb, url: displayUrl })
}
