import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

let vapidSet = false
function initVapid() {
  if (vapidSet) return
  const pub  = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return
  webpush.setVapidDetails('mailto:juanpgl120920@gmail.com', pub, priv)
  vapidSet = true
}

export async function sendPushToTenant(
  tenantId: string,
  title: string,
  body: string,
  tag = 'mensaje'
) {
  initVapid()
  if (!vapidSet) return // VAPID no configurado — sin push

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('tenant_id', tenantId)

  if (!subs?.length) return

  const payload = JSON.stringify({ title, body, tag, url: '/admin/mensajes/bandeja' })

  await Promise.allSettled(
    subs.map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      ).catch(async (err: { statusCode?: number }) => {
        // Suscripción expirada → eliminar
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      })
    )
  )
}
