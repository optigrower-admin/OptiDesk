import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

async function encryptToken(text: string): Promise<string> {
  const { encrypt } = await import('@/lib/crypto')
  return encrypt(text)
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('tenant_id, rol')
    .eq('id', user.id)
    .single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { data: config } = await supabase
    .from('config_meta')
    .select('id,tenant_id,meta_app_id,wa_phone_number_id,wa_phone_number,wa_business_account_id,messenger_page_id,instagram_account_id,meta_webhook_verify_token,negocio_verificado,estado_wa,estado_messenger,estado_instagram,limite_diario_wa,mensajes_iniciados_hoy,limite_reset_at,wa_access_token_enc,messenger_access_token_enc,instagram_access_token_enc,meta_app_secret_enc')
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()

  if (!config) return NextResponse.json({ config: null })

  // Contar plantillas enviadas hoy directamente desde mensajes (fuente de verdad real)
  // Esto evita depender del contador almacenado que puede estar contaminado
  const hoyUTC = new Date(); hoyUTC.setUTCHours(0, 0, 0, 0)
  const { count: plantillasHoy } = await supabase
    .from('mensajes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', perfil.tenant_id)
    .eq('tipo', 'plantilla')
    .eq('direccion', 'saliente')
    .gte('created_at', hoyUTC.toISOString())

  // Enmascarar tokens sensibles — nunca exponer al cliente
  return NextResponse.json({
    config: {
      ...config,
      mensajes_iniciados_hoy:       plantillasHoy ?? 0,
      wa_access_token_enc:          config.wa_access_token_enc          ? '***' : null,
      messenger_access_token_enc:   config.messenger_access_token_enc   ? '***' : null,
      instagram_access_token_enc:   config.instagram_access_token_enc   ? '***' : null,
      meta_app_secret_enc:          config.meta_app_secret_enc          ? '***' : null,
    },
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('tenant_id, rol')
    .eq('id', user.id)
    .single()
  if (!perfil || !['control_total', 'gerencia', 'admin'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json()
  const MASK = '***'

  const upsertData: Record<string, unknown> = {
    tenant_id:                  perfil.tenant_id,
    meta_app_id:                body.meta_app_id          || null,
    meta_webhook_verify_token:  body.meta_webhook_verify_token || null,
    wa_phone_number_id:         body.wa_phone_number_id   || null,
    wa_phone_number:            body.wa_phone_number      || null,
    wa_business_account_id:     body.wa_business_account_id || null,
    messenger_page_id:          body.messenger_page_id    || null,
    instagram_account_id:       body.instagram_account_id || null,
    estado_wa:                  body.estado_wa            || 'desconectado',
    updated_at:                 new Date().toISOString(),
  }

  // Encriptar tokens nuevos (ignorar si llega el mask '***')
  const encryptIfNew = async (val: string | undefined, field: string) => {
    if (val && val !== MASK) {
      upsertData[field] = await encryptToken(val)
    }
  }

  try {
    await Promise.all([
      encryptIfNew(body.wa_access_token,          'wa_access_token_enc'),
      encryptIfNew(body.meta_app_secret,          'meta_app_secret_enc'),
      encryptIfNew(body.messenger_access_token,   'messenger_access_token_enc'),
      encryptIfNew(body.instagram_access_token,   'instagram_access_token_enc'),
    ])
  } catch {
    // Sin ENCRYPTION_KEY → guardar sin encriptar (solo en desarrollo local)
    if (body.wa_access_token          && body.wa_access_token          !== MASK) upsertData.wa_access_token_enc          = body.wa_access_token
    if (body.meta_app_secret          && body.meta_app_secret          !== MASK) upsertData.meta_app_secret_enc          = body.meta_app_secret
    if (body.messenger_access_token   && body.messenger_access_token   !== MASK) upsertData.messenger_access_token_enc   = body.messenger_access_token
    if (body.instagram_access_token   && body.instagram_access_token   !== MASK) upsertData.instagram_access_token_enc   = body.instagram_access_token
  }

  // Usar admin client para bypass RLS en upsert
  const admin = createAdminClient()
  const { error } = await admin
    .from('config_meta')
    .upsert(upsertData, { onConflict: 'tenant_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['control_total', 'gerencia', 'admin'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json()
  const allowed = ['negocio_verificado', 'limite_diario_wa']
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('config_meta')
    .update(patch)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || perfil.rol !== 'gerencia') {
    return NextResponse.json({ error: 'Solo gerencia puede desconectar' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('config_meta')
    .update({
      wa_access_token_enc: null, meta_app_secret_enc: null,
      messenger_access_token_enc: null, instagram_access_token_enc: null,
      estado_wa: 'desconectado', estado_messenger: 'desconectado', estado_instagram: 'desconectado',
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
