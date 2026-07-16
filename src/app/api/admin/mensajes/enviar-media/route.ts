import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadToR2 } from '@/lib/r2'
import { decrypt } from '@/lib/crypto'

export const maxDuration = 60

// POST /api/admin/mensajes/enviar-media
// Recibe un FormData con: conversacion_id, file, tipo (imagen|documento|audio|video), caption
// Sube el archivo a R2, obtiene URL pública y lo envía vía Meta API

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })

  const tenantId: string = perfil.tenant_id

  // Leer el FormData
  const form = await req.formData()
  const conversacionId = form.get('conversacion_id')?.toString()
  const tipo           = (form.get('tipo')?.toString() ?? 'imagen') as 'imagen' | 'documento' | 'audio' | 'video'
  const caption        = form.get('caption')?.toString() ?? ''
  const file           = form.get('file') as File | null

  if (!conversacionId || !file) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  // Verificar acceso a la conversación
  const { data: conv } = await supabase
    .from('conversaciones')
    .select('id, canal, canal_contact_id')
    .eq('id', conversacionId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  // Subir archivo a R2
  const ext = file.name.split('.').pop() ?? 'bin'
  const r2Key = `mensajes/${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const arrayBuf = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)

  await uploadToR2(r2Key, buffer, file.type)

  // URL pública (requiere que el bucket tenga dominio público configurado)
  const publicUrl = process.env.R2_PUBLIC_URL
    ? `${process.env.R2_PUBLIC_URL}/${r2Key}`
    : `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${r2Key}`

  // Obtener credenciales Meta del tenant
  const { data: cfg } = await supabase
    .from('config_meta')
    .select('wa_access_token_enc, wa_phone_number_id, messenger_access_token_enc')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  let metaMessageId: string | null = null
  let enviado = false

  // ── Enviar vía WhatsApp ───────────────────────────────────────────────────
  if (conv.canal === 'whatsapp' && cfg?.wa_access_token_enc && cfg.wa_phone_number_id) {
    let token = cfg.wa_access_token_enc
    try { token = decrypt(token) } catch { /* dev */ }

    const tipoMeta = tipo === 'imagen' ? 'image' : tipo === 'documento' ? 'document' : tipo === 'audio' ? 'audio' : 'video'
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: conv.canal_contact_id,
      type: tipoMeta,
      [tipoMeta]: { link: publicUrl, ...(caption ? { caption } : {}), ...(tipo === 'documento' ? { filename: file.name } : {}) },
    }

    const r = await fetch(`https://graph.facebook.com/v20.0/${cfg.wa_phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (r.ok) {
      const d = await r.json() as { messages?: [{ id: string }] }
      metaMessageId = d.messages?.[0]?.id ?? null
      enviado = true
    } else {
      const err = await r.json() as { error?: { message?: string } }
      return NextResponse.json({ error: err.error?.message ?? 'Error Meta' }, { status: 422 })
    }
  }

  // ── Enviar vía Messenger ──────────────────────────────────────────────────
  if (conv.canal === 'messenger' && cfg?.messenger_access_token_enc) {
    let token = cfg.messenger_access_token_enc
    try { token = decrypt(token) } catch { /* dev */ }

    const tipoMeta = tipo === 'imagen' ? 'image' : tipo === 'audio' ? 'audio' : tipo === 'video' ? 'video' : 'file'
    const body = {
      recipient: { id: conv.canal_contact_id },
      message: { attachment: { type: tipoMeta, payload: { url: publicUrl, is_reusable: true } } },
    }

    const r = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
    media_url:       publicUrl,
  }).select('id, conversacion_id, direccion, tipo, contenido, enviado_por, estado_envio, created_at, leido_por_asesor, media_url').single()

  // Actualizar último mensaje de la conversación
  await supabase.from('conversaciones').update({
    ultimo_mensaje_at:       new Date().toISOString(),
    ultimo_mensaje_texto:    `[${tipo}] ${caption || file.name}`.slice(0, 100),
    ultimo_mensaje_direccion: 'saliente',
  }).eq('id', conversacionId)

  return NextResponse.json({ mensaje: msgDb, url: publicUrl })
}
