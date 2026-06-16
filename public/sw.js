self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Purgar cualquier caché de versiones anteriores de este Service Worker
  // (versiones viejas sí guardaban HTML/JS, lo que mezclaba despliegues entre sí)
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
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

// ── Push desde servidor (funciona con Chrome cerrado) ─────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'OptiDesk', body: 'Nuevo mensaje', tag: 'mensaje', url: '/admin/mensajes/bandeja' }
  try { if (event.data) data = { ...data, ...event.data.json() } } catch { /**/ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:     data.body,
      icon:     '/icons/icon-192.png',
      tag:      data.tag,
      renotify: true,
      data:     { url: data.url },
    })
  )
})

// No interceptamos requests de navegación ni de chunks de Next.js (_next/static):
// cachear esas respuestas mezclaba HTML/JS de distintos despliegues entre sí
// (la HTML de un deploy viejo con chunks de uno nuevo, o viceversa), lo que producía
// errores de hidratación de React y pantalla en blanco justo después de cada deploy.
// El navegador maneja esas requests directamente, sin paso por el Service Worker.
