import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'

// POST /api/admin/config-apis-ia
// Guarda (upsert) las claves de APIs IA para el tenant.
// Las claves se cifran con AES-256 antes de almacenarse.
// Campos que acepta: openai_key, anthropic_key, elevenlabs_key,
//                   openai_modelo, anthropic_modelo, elevenlabs_voz_id

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })
  if (perfil.rol !== 'admin' && perfil.rol !== 'superadmin') {
    return NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 })
  }

  const body = await req.json() as Record<string, string>
  const patch: Record<string, string> = { updated_at: new Date().toISOString() }

  if (body.openai_key?.trim())     patch.openai_key_enc     = encrypt(body.openai_key.trim())
  if (body.anthropic_key?.trim())  patch.anthropic_key_enc  = encrypt(body.anthropic_key.trim())
  if (body.elevenlabs_key?.trim()) patch.elevenlabs_key_enc = encrypt(body.elevenlabs_key.trim())
  if (body.openai_modelo)          patch.openai_modelo_default    = body.openai_modelo
  if (body.anthropic_modelo)       patch.anthropic_modelo_default = body.anthropic_modelo
  if (body.elevenlabs_voz_id !== undefined) patch.elevenlabs_voz_id = body.elevenlabs_voz_id

  const { error } = await supabase
    .from('config_apis_ia')
    .upsert({ tenant_id: perfil.tenant_id, ...patch }, { onConflict: 'tenant_id' })

  if (error) {
    console.error('[config-apis-ia] error upsert:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// GET /api/admin/config-apis-ia
// Devuelve la configuración actual con indicadores de si cada clave está configurada
// (sin exponer las claves cifradas al cliente).

export async function GET(_req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })

  const { data } = await supabase
    .from('config_apis_ia')
    .select('openai_key_enc, anthropic_key_enc, elevenlabs_key_enc, openai_modelo_default, anthropic_modelo_default, elevenlabs_voz_id')
    .eq('tenant_id', perfil.tenant_id)
    .maybeSingle()

  return NextResponse.json({
    tiene_openai:     !!data?.openai_key_enc,
    tiene_anthropic:  !!data?.anthropic_key_enc,
    tiene_elevenlabs: !!data?.elevenlabs_key_enc,
    openai_modelo:    data?.openai_modelo_default    ?? 'gpt-4o-mini',
    anthropic_modelo: data?.anthropic_modelo_default ?? 'claude-haiku-4-5-20251001',
    elevenlabs_voz_id: data?.elevenlabs_voz_id ?? '',
  })
}
