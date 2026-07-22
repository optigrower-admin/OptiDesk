import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { google } from 'googleapis'

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get('code')
  const stateRaw = req.nextUrl.searchParams.get('state') ?? ''
  const error    = req.nextUrl.searchParams.get('error')

  // El state contiene "tenantId|origin"
  const [tenantId, origin, redirectTo] = stateRaw.split('|')
  const base = origin || req.nextUrl.origin
  const returnUrl = redirectTo === 'control_total'
    ? `${base}/control_total/storage`
    : redirectTo === 'config-ventas'
      ? `${base}/admin/config-ventas`
      : `${base}/admin/config-servicio`

  if (error || !code || !tenantId) {
    return NextResponse.redirect(`${returnUrl}?drive_error=${encodeURIComponent(error ?? 'oauth_cancelled')}`)
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  try {
    const redirectUri = `${base}/api/drive/callback`

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID!,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirectUri,
    )

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      // Si Google no devuelve refresh_token es porque ya se había autorizado antes
      // y no se usó prompt=consent. Redirigir con aviso.
      return NextResponse.redirect(`${returnUrl}?drive_error=no_refresh_token`)
    }

    // Guardar el refresh token en la tabla tenants
    let saved = false
    try {
      const admin = createAdminClient()
      const { error: upErr } = await admin
        .from('tenants')
        .update({ google_refresh_token: tokens.refresh_token })
        .eq('id', tenantId)
      saved = !upErr
    } catch {
      // Fallback al cliente autenticado si admin no está disponible
    }

    if (!saved) {
      await supabase
        .from('tenants')
        .update({ google_refresh_token: tokens.refresh_token })
        .eq('id', tenantId)
    }

    return NextResponse.redirect(`${returnUrl}?drive_ok=1`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.redirect(`${returnUrl}?drive_error=${encodeURIComponent(msg)}`)
  }
}
