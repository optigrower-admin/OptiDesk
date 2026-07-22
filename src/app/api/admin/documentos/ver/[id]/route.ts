import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

export const dynamic = 'force-dynamic'

// MIME types de Google Docs nativos → exportar como PDF para visualizar
const GOOGLE_EXPORT_MAP: Record<string, string> = {
  'application/vnd.google-apps.document':     'application/pdf',
  'application/vnd.google-apps.spreadsheet':  'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.drawing':      'image/svg+xml',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('No autorizado', { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? ''))
    return new NextResponse('Sin permiso', { status: 403 })

  const { data: tenant } = await supabase
    .from('tenants')
    .select('google_refresh_token')
    .eq('id', perfil!.tenant_id)
    .single()

  if (!tenant?.google_refresh_token)
    return new NextResponse('Drive no conectado', { status: 400 })

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: tenant.google_refresh_token })
  const drive = google.drive({ version: 'v3', auth })

  // Obtener metadata del archivo
  const meta = await drive.files.get({ fileId: params.id, fields: 'mimeType,name' })
  const mimeType = meta.data.mimeType ?? 'application/octet-stream'

  const exportMime = GOOGLE_EXPORT_MAP[mimeType]

  let buffer: Buffer
  let contentType: string

  if (exportMime) {
    // Archivo nativo de Google → exportar como PDF
    const res = await drive.files.export(
      { fileId: params.id, mimeType: exportMime },
      { responseType: 'arraybuffer' }
    )
    buffer = Buffer.from(res.data as ArrayBuffer)
    contentType = exportMime
  } else {
    // Archivo binario → descargar directamente
    const res = await drive.files.get(
      { fileId: params.id, alt: 'media' },
      { responseType: 'arraybuffer' }
    )
    buffer = Buffer.from(res.data as ArrayBuffer)
    contentType = mimeType
  }

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
