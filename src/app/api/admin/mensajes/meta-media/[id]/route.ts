import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('No autorizado', { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return new NextResponse('Sin empresa', { status: 403 })

  const { data: cfg } = await supabase
    .from('config_meta')
    .select('wa_access_token_enc')
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()

  if (!cfg?.wa_access_token_enc) return new NextResponse('Sin token WhatsApp', { status: 404 })

  let token = cfg.wa_access_token_enc
  try {
    const { decrypt } = await import('@/lib/crypto')
    token = decrypt(cfg.wa_access_token_enc)
  } catch { /* dev — token sin encriptar */ }

  // 1. Obtener URL fresca del archivo desde Meta
  const metaRes = await fetch(
    `https://graph.facebook.com/v20.0/${params.id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!metaRes.ok) {
    return new NextResponse('Media no disponible en Meta', { status: 502 })
  }
  const { url } = await metaRes.json() as { url?: string }
  if (!url) return new NextResponse('URL no disponible', { status: 502 })

  // 2. Descargar el archivo desde el CDN de Meta (requiere el token Bearer)
  const fileRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!fileRes.ok) return new NextResponse('Error al descargar media', { status: 502 })

  const contentType = fileRes.headers.get('content-type') ?? 'application/octet-stream'
  const buffer = await fileRes.arrayBuffer()

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
