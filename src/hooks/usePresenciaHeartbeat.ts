'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const INTERVALO_MS = 20_000
const IDLE_MS = 2 * 60_000 // sin interacción por 2 min → se considera "inactivo" aunque la pestaña siga abierta

/** Manda un heartbeat periódico mientras el usuario tiene OptiDesk abierto,
 * para alimentar el panel de presencia/uso en Mi Equipo. Se engancha una sola
 * vez en el layout del admin — no requiere nada en cada page.tsx. */
export function usePresenciaHeartbeat(habilitado: boolean) {
  const pathname = usePathname()
  const ultimaActividad = useRef(Date.now())
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    if (!habilitado) return

    const marcarActividad = () => { ultimaActividad.current = Date.now() }
    const eventos: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    eventos.forEach(e => window.addEventListener(e, marcarActividad, { passive: true }))

    const enviar = () => {
      if (document.visibilityState !== 'visible') return
      const activo = Date.now() - ultimaActividad.current < IDLE_MS
      fetch('/api/presencia/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo, pagina: pathnameRef.current }),
        keepalive: true,
      }).catch(() => {})
    }

    enviar()
    const t = setInterval(enviar, INTERVALO_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') enviar() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      eventos.forEach(e => window.removeEventListener(e, marcarActividad))
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(t)
    }
  }, [habilitado])
}
