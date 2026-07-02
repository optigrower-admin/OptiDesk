import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const body = await req.json()
  const admin = createAdminClient()

  const { error } = await admin.from('tenants').update({
    cotizacion_tagline:          body.tagline        || null,
    cotizacion_direccion:        body.direccion      || null,
    cotizacion_telefono1:        body.telefono1      || null,
    cotizacion_telefono2:        body.telefono2      || null,
    cotizacion_email:            body.email          || null,
    cotizacion_web:              body.web            || null,
    cotizacion_whatsapp:         body.whatsapp       || null,
    cotizacion_instagram:        body.instagram      || null,
    cotizacion_facebook:         body.facebook       || null,
    cotizacion_tiktok:           body.tiktok         || null,
    cotizacion_incluye:          body.incluye        || null,
    recargo_tarjeta_porcentaje:  body.recargoTarjeta ?? 5,
  }).eq('id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
