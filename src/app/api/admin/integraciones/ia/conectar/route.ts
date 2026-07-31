import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { encrypt } from '@/lib/crypto'

const PROVEEDORES = ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'GROK', 'ELEVENLABS'] as const

/** Llamada mínima de prueba, sin registrar uso, solo para validar la key antes de guardar. */
async function probarKey(proveedor: string, apiKey: string, modelo: string | undefined): Promise<{ ok: boolean; error?: string }> {
  try {
    if (proveedor === 'OPENAI' || proveedor === 'GROK') {
      const url = proveedor === 'OPENAI' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions'
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelo || (proveedor === 'OPENAI' ? 'gpt-4o-mini' : 'grok-2-latest'), messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      })
      const data = await r.json()
      return r.ok ? { ok: true } : { ok: false, error: data?.error?.message ?? `Error de ${proveedor}` }
    }
    if (proveedor === 'ANTHROPIC') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelo || 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }),
      })
      const data = await r.json()
      return r.ok ? { ok: true } : { ok: false, error: data?.error?.message ?? 'Error de Anthropic' }
    }
    if (proveedor === 'GOOGLE') {
      const mdl = modelo || 'gemini-2.0-flash'
      const r = await fetch(`https://generativelanguage.googleapis.com/v1/models/${mdl}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 5 } }),
      })
      const data = await r.json()
      return r.ok ? { ok: true } : { ok: false, error: data?.error?.message ?? 'Error de Google Gemini' }
    }
    if (proveedor === 'ELEVENLABS') {
      const r = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': apiKey } })
      const data = await r.json().catch(() => null)
      return r.ok ? { ok: true } : { ok: false, error: data?.detail?.message ?? 'Error de ElevenLabs' }
    }
    return { ok: false, error: 'Proveedor no soportado' }
  } catch {
    return { ok: false, error: 'No se pudo conectar con el proveedor' }
  }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol, id').eq('id', user.id).single()
  if (!perfil || !['gerencia', 'control_total'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const proveedor = body?.proveedor as string
  const apiKey = body?.api_key as string
  const modelo = body?.modelo_default as string | undefined
  const usoAsignado = Array.isArray(body?.uso_asignado) ? body.uso_asignado : []

  if (!PROVEEDORES.includes(proveedor as typeof PROVEEDORES[number])) {
    return NextResponse.json({ error: 'Proveedor inválido' }, { status: 400 })
  }
  if (!apiKey?.trim()) return NextResponse.json({ error: 'Falta la API key' }, { status: 400 })

  const prueba = await probarKey(proveedor, apiKey.trim(), modelo)
  if (!prueba.ok) return NextResponse.json({ error: prueba.error ?? 'La key no pasó la prueba de conexión' }, { status: 422 })

  const admin = createAdminClient()
  const { error } = await admin.from('integraciones_ia').upsert({
    tenant_id: perfil.tenant_id,
    proveedor,
    api_key_encrypted: encrypt(apiKey.trim()),
    modelo_default: modelo || null,
    uso_asignado: usoAsignado,
    activo: true,
    creada_por: perfil.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,proveedor' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
