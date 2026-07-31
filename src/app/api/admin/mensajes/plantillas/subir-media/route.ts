import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

const GRAPH_VERSION = 'v20.0'

// Límite práctico: el body de una función serverless de Vercel tiene un tope
// de ~4.5 MB. Cubre imágenes y documentos pequeños/medianos, que son el caso
// de uso normal para el header de ejemplo de una plantilla.
const MAX_BYTES = 4 * 1024 * 1024

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

/**
 * POST /api/admin/mensajes/plantillas/subir-media
 *
 * Sube un archivo (imagen/video/documento) al "resumable upload" de Meta
 * para usarlo como ejemplo del header de una plantilla, y devuelve el
 * "handle" que Meta exige en message_templates → components → HEADER.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['admin', 'gerencia', 'control_total'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo enviado.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo soportado aquí es 4 MB — para archivos más grandes, súbelo directo en Meta Business Manager y pega el handle manualmente.` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: cfg } = await admin
    .from('config_meta')
    .select('meta_app_id, wa_access_token_enc')
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()

  if (!cfg?.meta_app_id || !cfg?.wa_access_token_enc) {
    return NextResponse.json({ error: 'Meta no está conectado o falta el App ID. Configúralo en Conexión Meta.' }, { status: 400 })
  }

  const token = await decryptToken(cfg.wa_access_token_enc)
  const buffer = Buffer.from(await file.arrayBuffer())
  const mimeType = file.type || 'application/octet-stream'

  try {
    // Paso 1: crear la sesión de subida
    const sessionRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.meta_app_id}/uploads` +
      `?file_length=${buffer.length}&file_type=${encodeURIComponent(mimeType)}&access_token=${encodeURIComponent(token)}`,
      { method: 'POST' },
    )
    const sessionData = await sessionRes.json()
    if (!sessionRes.ok || !sessionData?.id) {
      const msg = sessionData?.error?.error_user_msg || sessionData?.error?.message || 'No se pudo iniciar la subida a Meta'
      return NextResponse.json({ error: msg, code: 'META_ERROR' }, { status: 422 })
    }

    // Paso 2: subir los bytes a la sesión creada
    const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${sessionData.id}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: '0',
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    })
    const uploadData = await uploadRes.json()
    if (!uploadRes.ok || !uploadData?.h) {
      const msg = uploadData?.error?.error_user_msg || uploadData?.error?.message || 'No se pudo subir el archivo a Meta'
      return NextResponse.json({ error: msg, code: 'META_ERROR' }, { status: 422 })
    }

    return NextResponse.json({ ok: true, handle: uploadData.h as string })
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con Meta para subir el archivo.' }, { status: 502 })
  }
}
