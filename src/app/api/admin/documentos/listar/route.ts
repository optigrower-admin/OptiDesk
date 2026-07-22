import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data: tenant } = await supabase
    .from('tenants')
    .select('documentos_folder_id, google_refresh_token')
    .eq('id', perfil!.tenant_id)
    .single()

  if (!tenant?.google_refresh_token)
    return NextResponse.json({ error: 'Drive no conectado' }, { status: 400 })
  if (!tenant?.documentos_folder_id)
    return NextResponse.json({ error: 'Carpeta no configurada' }, { status: 400 })

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: tenant.google_refresh_token })
  const drive = google.drive({ version: 'v3', auth })

  // Si se pasa ?folder=ID se navega a una subcarpeta
  const url = new URL(req.url)
  const folderId = url.searchParams.get('folder') ?? tenant.documentos_folder_id

  // Listar archivos y sub-carpetas directas
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink,thumbnailLink)',
    orderBy: 'folder,name',
    pageSize: 200,
  })

  return NextResponse.json({ files: res.data.files ?? [] })
}
