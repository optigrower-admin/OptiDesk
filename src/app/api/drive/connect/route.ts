import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('rol, tenant_id').eq('id', user.id).single()
  const rolesPermitidos = ['control_total', 'gerencia', 'dueno', 'admin']
  if (!perfil || !rolesPermitidos.includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // control_total puede conectar cualquier tenant; los demás solo el suyo
  const tenantId = perfil.rol === 'control_total'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? perfil.tenant_id)
    : perfil.tenant_id
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
    // state = "tenantId|origin|redirectTo"  (redirectTo = 'admin' | 'control_total')
    state: `${tenantId}|${origin}|${req.nextUrl.searchParams.get('redirect_to') ?? 'admin'}`,
  })

  return NextResponse.redirect(url)
}
