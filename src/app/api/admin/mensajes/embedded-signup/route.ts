import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

const APP_ID     = process.env.NEXT_PUBLIC_META_APP_ID!
const APP_SECRET = process.env.META_APP_SECRET!

// POST — intercambiar código de Embedded Signup por token y obtener números disponibles
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { accessToken: shortToken } = await request.json()
  if (!shortToken) return NextResponse.json({ error: 'Falta el token de acceso' }, { status: 400 })

  // Extender a token de larga duración (60 días)
  const llRes = await fetch(
    `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`
  )
  const llData = await llRes.json()
  const accessToken = llData.access_token ?? shortToken

  // 3. Buscar WABA por múltiples rutas
  let wabaId = ''
  let wabaName = ''
  let phoneNumbers: Array<{ id: string; display_phone_number: string; verified_name: string }> = []

  // Ruta A: /me/whatsapp_business_accounts (más directa)
  const directWabaRes = await fetch(
    `https://graph.facebook.com/v20.0/me/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name`
  )
  const directWabaData = await directWabaRes.json()
  if (directWabaData.data?.length) {
    wabaId   = directWabaData.data[0].id
    wabaName = directWabaData.data[0].name
  }

  // Ruta B: a través de negocios del usuario
  if (!wabaId) {
    const bizRes = await fetch(
      `https://graph.facebook.com/v20.0/me/businesses?access_token=${accessToken}&fields=id,name`
    )
    const bizData = await bizRes.json()
    const businesses: Array<{ id: string; name: string }> = bizData.data ?? []

    for (const biz of businesses) {
      const wabaRes = await fetch(
        `https://graph.facebook.com/v20.0/${biz.id}/whatsapp_business_accounts?access_token=${accessToken}&fields=id,name`
      )
      const wabaData = await wabaRes.json()
      if (wabaData.data?.length) {
        wabaId   = wabaData.data[0].id
        wabaName = wabaData.data[0].name || biz.name
        break
      }
    }
  }

  // Ruta C: client credentials — buscar WABA de la propia app
  if (!wabaId) {
    const appTokenRes = await fetch(
      `https://graph.facebook.com/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&grant_type=client_credentials`
    )
    const appTokenData = await appTokenRes.json()
    if (appTokenData.access_token) {
      const appWabaRes = await fetch(
        `https://graph.facebook.com/v20.0/${APP_ID}/subscribed_whatsapp_business_accounts?access_token=${appTokenData.access_token}`
      )
      const appWabaData = await appWabaRes.json()
      if (appWabaData.data?.length) {
        wabaId   = appWabaData.data[0].id
        wabaName = appWabaData.data[0].name ?? 'WhatsApp Business'
      }
    }
  }

  if (!wabaId) {
    // Devolver debug info para diagnóstico
    const debugRes = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${APP_ID}|${APP_SECRET}`
    )
    const debugData = await debugRes.json()
    return NextResponse.json({
      error: 'No se encontró ninguna cuenta de WhatsApp Business. Asegúrate de tener una cuenta activa en tu Facebook Business.',
      debug: debugData,
    }, { status: 400 })
  }

  // 5. Obtener números de teléfono del WABA
  const phoneRes = await fetch(
    `https://graph.facebook.com/v20.0/${wabaId}/phone_numbers?access_token=${accessToken}&fields=id,display_phone_number,verified_name`
  )
  const phoneData = await phoneRes.json()
  phoneNumbers = phoneData.data ?? []

  // 6. Suscribir WABA al webhook de la plataforma
  await fetch(
    `https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps?access_token=${accessToken}&subscribed_fields=messages,message_template_status_update`,
    { method: 'POST' }
  )

  return NextResponse.json({
    waba_id:      wabaId,
    waba_name:    wabaName,
    phone_numbers: phoneNumbers,
    access_token: accessToken,
  })
}

// PUT — guardar el número seleccionado y activar la conexión
export async function PUT(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { waba_id, phone_number_id, phone_number, verified_name, access_token } = await request.json()
  if (!waba_id || !phone_number_id || !access_token) {
    return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 })
  }

  // Generar verify token único para este tenant
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let verifyToken = ''
  for (let i = 0; i < 32; i++) verifyToken += chars[Math.floor(Math.random() * chars.length)]

  let tokenEnc = access_token
  try {
    const { encrypt } = await import('@/lib/crypto')
    tokenEnc = encrypt(access_token)
  } catch { /* sin ENCRYPTION_KEY en dev */ }

  const admin = createAdminClient()
  const { error } = await admin.from('config_meta').upsert({
    tenant_id:                  perfil.tenant_id,
    meta_app_id:                APP_ID,
    wa_business_account_id:     waba_id,
    wa_phone_number_id:         phone_number_id,
    wa_phone_number:            phone_number,
    wa_access_token_enc:        tokenEnc,
    meta_webhook_verify_token:  verifyToken,
    estado_wa:                  'conectado',
    negocio_verificado:         true,
    limite_diario_wa:           1000,
    mensajes_iniciados_hoy:     0,
    limite_reset_at:            new Date().toISOString(),
    updated_at:                 new Date().toISOString(),
  }, { onConflict: 'tenant_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, phone_number, verified_name })
}
