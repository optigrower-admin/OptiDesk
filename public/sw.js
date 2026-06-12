const CACHE_NAME = 'optidesk-v1'
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ── Notificaciones de mensajes ────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const data = event.data
  // Activar nueva versión del SW inmediatamente cuando la página lo pide
  if (data?.type === 'SKIP_WAITING') { self.skipWaiting(); return }
  if (!data || data.type !== 'SHOW_NOTIFICATION') return

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:     data.body,
      icon:     '/icons/icon-192.png',
      tag:      data.tag,
      renotify: true,
      data:     { url: data.url || '/admin/mensajes/bandeja' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/admin/mensajes/bandeja'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.focus()
          client.postMessage({ type: 'SW_NAV', url })
          return
        }
      }
      return self.clients.openWindow(url)
    })
  )
})

self.addEventListener('fetch', (event) => {
  // Solo cachear requests GET de assets estáticos
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Actualizar cache con respuesta fresca
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
