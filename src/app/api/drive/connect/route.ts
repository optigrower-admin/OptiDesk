import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'control_total') {
    return NextResponse.json({ error: 'Solo control_total' }, { status: 403 })
  }

  const tenantId = req.nextUrl.searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ error: 'Falta tenant_id' }, { status: 400 })

  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Configura GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en las variables de entorno.' },
      { status: 500 },
    )
  }

  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/drive/callback`

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri,
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',  // force para siempre recibir refresh_token
    scope: ['https://www.googleapis.com/auth/drive'],
    state: `${tenantId}|${origin}`,
  })

  return NextResponse.redirect(url)
}
