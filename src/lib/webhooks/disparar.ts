import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

const BACKOFF_MIN = [1, 5, 15]
const MAX_INTENTOS = 3

type AdminClient = ReturnType<typeof createAdminClient>

function firmar(secreto: string, body: string): string {
  return crypto.createHmac('sha256', secreto).update(body).digest('hex')
}

async function intentarEntrega(
  admin: AdminClient,
  sub: { id: string; url_destino: string; secreto: string },
  deliveryId: string,
  evento: string,
  payload: Record<string, unknown>,
  intento: number,
) {
  const body = JSON.stringify({ evento, payload, timestamp: new Date().toISOString() })
  const firma = firmar(sub.secreto, body)

  let statusCode: number | null = null
  let ok = false
  try {
    const r = await fetch(sub.url_destino, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OptiDesk-Signature': `sha256=${firma}`,
        'X-OptiDesk-Event': evento,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    statusCode = r.status
    ok = r.ok
  } catch {
    ok = false
  }

  const proximaReintento = !ok && intento < MAX_INTENTOS
    ? new Date(Date.now() + BACKOFF_MIN[intento - 1] * 60_000).toISOString()
    : null

  await admin.from('webhook_deliveries').update({
    status_code_respuesta: statusCode,
    intento_numero: intento,
    exitoso: ok,
    proxima_reintento_at: proximaReintento,
  }).eq('id', deliveryId)
}

/**
 * Busca las suscripciones activas del tenant que escuchen `evento`, firma el
 * payload con HMAC-SHA256 y lo envía. Si falla, deja la entrega marcada para
 * reintento (la retoma el cron /api/cron/webhooks-reintentar).
 */
export async function dispararWebhook(tenantId: string, evento: string, payload: Record<string, unknown>) {
  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('webhook_subscriptions')
    .select('id, url_destino, eventos, secreto')
    .eq('tenant_id', tenantId)
    .eq('activo', true)

  const activas = (subs ?? []).filter(s => Array.isArray(s.eventos) && (s.eventos as string[]).includes(evento))

  await Promise.allSettled(activas.map(async (sub) => {
    const { data: delivery } = await admin
      .from('webhook_deliveries')
      .insert({ webhook_subscription_id: sub.id, evento, payload, intento_numero: 1, exitoso: false })
      .select('id')
      .single()
    if (!delivery) return
    await intentarEntrega(admin, sub, delivery.id, evento, payload, 1)
  }))
}

/** Envía un evento test.ping a una suscripción puntual, sin importar sus eventos suscritos. */
export async function probarWebhook(subscriptionId: string) {
  const admin = createAdminClient()
  const { data: sub } = await admin
    .from('webhook_subscriptions')
    .select('id, url_destino, secreto')
    .eq('id', subscriptionId)
    .single()
  if (!sub) throw new Error('Suscripción no encontrada')

  const { data: delivery } = await admin
    .from('webhook_deliveries')
    .insert({ webhook_subscription_id: sub.id, evento: 'test.ping', payload: { mensaje: 'ping de prueba desde OptiDesk' }, intento_numero: 1, exitoso: false })
    .select('id')
    .single()
  if (!delivery) throw new Error('No se pudo registrar el intento')

  await intentarEntrega(admin, sub, delivery.id, 'test.ping', { mensaje: 'ping de prueba desde OptiDesk' }, 1)
}

/** Retoma entregas fallidas cuyo próximo reintento ya venció. Llamado por el cron. */
export async function reintentarPendientes() {
  const admin = createAdminClient()
  const { data: pendientes } = await admin
    .from('webhook_deliveries')
    .select('id, evento, payload, intento_numero, webhook_subscriptions!inner(id, url_destino, secreto, activo)')
    .eq('exitoso', false)
    .not('proxima_reintento_at', 'is', null)
    .lte('proxima_reintento_at', new Date().toISOString())
    .limit(50)

  let procesados = 0
  for (const d of pendientes ?? []) {
    const sub = d.webhook_subscriptions as unknown as { id: string; url_destino: string; secreto: string; activo: boolean } | null
    if (!sub?.activo) continue
    await intentarEntrega(admin, sub, d.id, d.evento, d.payload as Record<string, unknown>, d.intento_numero + 1)
    procesados++
  }
  return procesados
}
