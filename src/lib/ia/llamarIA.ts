import { createAdminClient } from '@/lib/supabase/admin'

export type ProveedorIA = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'GROK' | 'ELEVENLABS'

export interface OpcionesIA {
  modelo?: string
  maxTokens?: number
  temperatura?: number
  /** Para ElevenLabs TTS ('generar_audio'): id de la voz a usar. */
  voiceId?: string
  /** Fuerza un proveedor puntual cuando hay varios activos asignados al mismo uso. */
  proveedor?: ProveedorIA
  /** Para análisis de imagen (visión) — solo soportado por OpenAI aquí. */
  imagenBase64?: string
  imagenMimeType?: string
}

export interface ResultadoIA {
  ok: boolean
  texto?: string
  audioBase64?: string
  imagenUrl?: string
  proveedor?: ProveedorIA
  error?: string
}

// Precios aproximados en USD por 1000 tokens (entrada/salida) — solo para dar
// una referencia de costo en el panel, no es una factura exacta.
const PRECIOS_APROX: Record<string, { in: number; out: number }> = {
  'gpt-4o': { in: 0.005, out: 0.015 },
  'gpt-4o-mini': { in: 0.00015, out: 0.0006 },
  'claude-sonnet-4-6': { in: 0.003, out: 0.015 },
  'claude-haiku-4-5-20251001': { in: 0.0008, out: 0.004 },
  'gemini-2.0-flash': { in: 0.0001, out: 0.0004 },
}

async function decrypt(enc: string): Promise<string> {
  try {
    const { decrypt: d } = await import('@/lib/crypto')
    return d(enc)
  } catch {
    return enc
  }
}

async function registrarUso(tenantId: string, proveedor: string, uso: string, tokensIn: number, tokensOut: number, duracionMs: number, exitoso: boolean) {
  const admin = createAdminClient()
  const precio = PRECIOS_APROX[proveedor.toLowerCase()] ?? { in: 0, out: 0 }
  const costo = (tokensIn / 1000) * precio.in + (tokensOut / 1000) * precio.out
  await admin.from('ia_usage_logs').insert({
    tenant_id: tenantId, proveedor, uso,
    tokens_entrada: tokensIn || null, tokens_salida: tokensOut || null,
    costo_estimado: costo || null, duracion_ms: duracionMs, exitoso,
  })
}

/**
 * Punto único para invocar cualquier proveedor de IA conectado en
 * `integraciones_ia`. Usado tanto por features fijas de OptiDesk como por el
 * nodo "Acción IA" del editor de Flujos (que arma el prompt en tiempo de
 * ejecución con las variables del flujo).
 */
export async function llamarIA(tenantId: string, uso: string, prompt: string, opciones: OpcionesIA = {}): Promise<ResultadoIA> {
  const admin = createAdminClient()
  const inicio = Date.now()

  const { data: integraciones } = await admin
    .from('integraciones_ia')
    .select('id, proveedor, api_key_encrypted, modelo_default, uso_asignado')
    .eq('tenant_id', tenantId)
    .eq('activo', true)

  const candidatas = (integraciones ?? []).filter(i => Array.isArray(i.uso_asignado) && (i.uso_asignado as string[]).includes(uso))
  const integracion = opciones.proveedor
    ? candidatas.find(i => i.proveedor === opciones.proveedor)
    : candidatas[0]
  if (!integracion) {
    return { ok: false, error: `No hay ninguna integración IA activa asignada al uso "${uso}". Conéctala en Integraciones → Integraciones IA.` }
  }

  const proveedor = integracion.proveedor as ProveedorIA
  const apiKey = await decrypt(integracion.api_key_encrypted)
  const modelo = opciones.modelo || integracion.modelo_default || undefined
  const maxTokens = opciones.maxTokens ?? 800
  const temperatura = opciones.temperatura ?? 0.7

  let resultado: ResultadoIA
  try {
    resultado = await llamarProveedor(proveedor, apiKey, modelo, prompt, maxTokens, temperatura, opciones, uso)
  } catch (e: unknown) {
    resultado = { ok: false, error: e instanceof Error ? e.message : 'Error al llamar la IA', proveedor }
  }

  await registrarUso(tenantId, proveedor, uso, 0, 0, Date.now() - inicio, resultado.ok)

  if (resultado.ok && uso === 'resumenes_conversacion') {
    const { dispararWebhook } = await import('@/lib/webhooks/disparar')
    dispararWebhook(tenantId, 'ia.resumen_generado', { texto: resultado.texto }).catch(() => {})
  }

  return resultado
}

async function llamarProveedor(
  proveedor: ProveedorIA, apiKey: string, modelo: string | undefined, prompt: string,
  maxTokens: number, temperatura: number, opciones: OpcionesIA, uso: string,
): Promise<ResultadoIA> {
  if (proveedor === 'OPENAI' && uso === 'generar_imagen') {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo || 'dall-e-3', prompt, n: 1, size: '1024x1024' }),
    })
    const data = await r.json()
    if (!r.ok) return { ok: false, error: data?.error?.message ?? 'Error de OpenAI (imagen)', proveedor }
    return { ok: true, imagenUrl: data.data?.[0]?.url ?? '', proveedor }
  }

  if (proveedor === 'OPENAI' || proveedor === 'GROK') {
    const url = proveedor === 'OPENAI' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions'
    // Análisis de imagen (visión) — solo OpenAI aquí; el content pasa de
    // string plano a un array multi-parte con la imagen en base64.
    const content = opciones.imagenBase64
      ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${opciones.imagenMimeType || 'image/jpeg'};base64,${opciones.imagenBase64}` } },
        ]
      : prompt
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo || (proveedor === 'OPENAI' ? 'gpt-4o-mini' : 'grok-2-latest'),
        messages: [{ role: 'user', content }],
        max_tokens: maxTokens,
        temperature: temperatura,
      }),
    })
    const data = await r.json()
    if (!r.ok) return { ok: false, error: data?.error?.message ?? `Error de ${proveedor}`, proveedor }
    return { ok: true, texto: data.choices?.[0]?.message?.content ?? '', proveedor }
  }

  if (proveedor === 'ANTHROPIC') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo || 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await r.json()
    if (!r.ok) return { ok: false, error: data?.error?.message ?? 'Error de Anthropic', proveedor }
    return { ok: true, texto: data.content?.[0]?.text ?? '', proveedor }
  }

  if (proveedor === 'GOOGLE') {
    const mdl = modelo || 'gemini-2.0-flash'
    const r = await fetch(`https://generativelanguage.googleapis.com/v1/models/${mdl}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: temperatura },
      }),
    })
    const data = await r.json()
    if (!r.ok) return { ok: false, error: data?.error?.message ?? 'Error de Google Gemini', proveedor }
    return { ok: true, texto: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '', proveedor }
  }

  if (proveedor === 'ELEVENLABS') {
    if (uso === 'transcripcion_audio') {
      return { ok: false, error: 'La transcripción de audio con ElevenLabs todavía no está implementada.', proveedor }
    }
    const voiceId = opciones.voiceId
    if (!voiceId) return { ok: false, error: 'Falta el ID de voz de ElevenLabs (voiceId).', proveedor }
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: prompt, model_id: modelo || 'eleven_multilingual_v2' }),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => null)
      return { ok: false, error: data?.detail?.message ?? 'Error de ElevenLabs', proveedor }
    }
    const buffer = Buffer.from(await r.arrayBuffer())
    return { ok: true, audioBase64: buffer.toString('base64'), proveedor }
  }

  return { ok: false, error: `Proveedor "${proveedor}" no soportado` }
}
