'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { cn } from '@/lib/utils'
import ManualButton from '@/components/ManualButton'

type NavItem = {
  href: string
  label: string
  seccion: string | null
  soloGerencia: boolean
  rolesPermitidos?: ('gerencia' | 'dueno')[]
  defaultOrden: number
  external?: boolean
  exactMatch?: boolean
}

type NavGroup = {
  key: string
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    items: [
      { href: '/admin/dashboard/servicio-tecnico', label: 'Servicio Técnico', seccion: 'dashboard_servicio_tecnico', soloGerencia: false, rolesPermitidos: ['gerencia', 'dueno'], defaultOrden: 5 },
      { href: '/admin/dashboard/repuestos',        label: 'Repuestos',       seccion: 'dashboard_repuestos',        soloGerencia: false, rolesPermitidos: ['gerencia', 'dueno'], defaultOrden: 6 },
    ],
  },
  {
    key: 'serv-tec',
    label: 'Serv Tec & Rep',
    items: [
      { href: '/admin/ordenes',         label: 'Servicio Técnico',   seccion: 'servicio_tecnico', soloGerencia: false, defaultOrden: 10  },
      { href: '/admin/repuestos',       label: 'Repuestos',          seccion: 'repuestos',        soloGerencia: false, defaultOrden: 20  },
      { href: '/admin/inventario',      label: 'Inventario',         seccion: 'inventario',       soloGerencia: false, defaultOrden: 30  },
      { href: '/admin/caja',            label: 'Caja',                seccion: 'caja',             soloGerencia: false, defaultOrden: 35  },
      { href: '/admin/clientes',        label: 'Clientes',           seccion: 'clientes',         soloGerencia: false, defaultOrden: 40  },
      { href: '/admin/motos',           label: 'Motos',              seccion: 'motos',            soloGerencia: false, defaultOrden: 50  },
      { href: '/admin/cotizaciones-servtec', label: 'Cotizaciones S.T.', seccion: 'cotizaciones_servtec', soloGerencia: false, defaultOrden: 55  },
      { href: '/admin/config-servicio', label: 'Config Serv. Téc.',  seccion: 'config_servicio',  soloGerencia: true,  defaultOrden: 85  },
    ],
  },
  {
    key: 'ventas',
    label: 'Ventas',
    items: [
      { href: '/admin/ventas/resumen',     label: '📊 Resumen Ventas',        seccion: 'ventas',        soloGerencia: false, defaultOrden: 54, exactMatch: true },
      { href: '/admin/ventas',             label: 'Seguimiento Ventas',       seccion: 'ventas',        soloGerencia: false, defaultOrden: 55, exactMatch: true },
      { href: '/admin/ventas/actividades', label: 'Seguimiento Actividades',  seccion: 'ventas',        soloGerencia: false, defaultOrden: 56 },
      { href: '/admin/lista-precios',      label: 'Lista de Motos',           seccion: 'lista_motos',    soloGerencia: false, defaultOrden: 57 },
      { href: '/admin/config-ventas',      label: 'Config Ventas',            seccion: 'config_ventas',  soloGerencia: true,  defaultOrden: 58 },
    ],
  },
  {
    key: 'mensajes',
    label: 'Mensajes',
    items: [
      { href: '/admin/mensajes/bandeja',       label: 'Bandeja',          seccion: 'mensajes_bandeja',       soloGerencia: false, defaultOrden: 100 },
      { href: '/admin/mensajes/conexion',      label: 'Conexión Meta',    seccion: 'mensajes_conexion',      soloGerencia: true,  defaultOrden: 110 },
      { href: '/admin/mensajes/plantillas',    label: 'Plantillas',       seccion: 'mensajes_plantillas',    soloGerencia: false, defaultOrden: 120 },
      { href: '/admin/mensajes/flujos',        label: 'Flujos',           seccion: 'mensajes_flujos',        soloGerencia: false, defaultOrden: 130 },
      { href: '/admin/mensajes/colaboradores', label: 'Bot Colaboradores', seccion: 'mensajes_flujos',       soloGerencia: true,  defaultOrden: 140 },
    ],
  },
  {
    key: 'comentarios',
    label: 'Comentarios',
    items: [
      { href: '/admin/comentarios/bandeja', label: 'Publicaciones', seccion: 'comentarios', soloGerencia: false, defaultOrden: 200 },
    ],
  },
]

const STANDALONE_NAV: NavItem[] = [
  { href: '/admin/reportes',    label: 'Reportes',          seccion: 'reportes',   soloGerencia: false, defaultOrden: 60  },
  { href: '/admin/auditoria',   label: 'Auditoría',         seccion: 'auditoria',  soloGerencia: false, defaultOrden: 70  },
  { href: '/admin/equipo',      label: 'Mi equipo',         seccion: 'mi_equipo',  soloGerencia: true,  defaultOrden: 80  },
  { href: '/admin/documentos',   label: 'Documentos Internos', seccion: null,       soloGerencia: false, rolesPermitidos: ['gerencia', 'dueno'], defaultOrden: 85 },
  { href: '/admin/credenciales',   label: 'Credenciales',   seccion: null, soloGerencia: false, rolesPermitidos: ['gerencia', 'dueno'], defaultOrden: 86  },
  { href: '/admin/config-general', label: 'Config General', seccion: null, soloGerencia: false, rolesPermitidos: ['gerencia', 'dueno'], defaultOrden: 998 },
  { href: '/admin/perfil',         label: 'Mi perfil',      seccion: null, soloGerencia: false,                                        defaultOrden: 999 },
]

const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', manual: 'Manual',
}
const CANAL_ICON: Record<string, string> = {
  whatsapp: '📱', messenger: '💬', instagram: '📸', manual: '✏️',
}

type ConvSnap = {
  id: string
  no_leidos_count: number
  ultimo_mensaje_at: string | null
  ultimo_mensaje_texto: string | null
  canal: string
  canal_contact_id: string
  clientes: { nombre: string | null }[] | null
}
type NotifToast = { nombre: string; canal: string; texto: string; convId: string }

// ── Ping de dos notas ascendentes (D5 → A5) ──────────────────────────────────
function playMsgSound() {
  try {
    type WA = Window & { webkitAudioContext?: typeof AudioContext }
    const Ctx = window.AudioContext ?? (window as WA).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()

    const ping = (freq: number, startAt: number, vol: number, dur: number) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(vol, startAt)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur)
      osc.start(startAt); osc.stop(startAt + dur)
    }

    ping(587,  ctx.currentTime,        0.30, 0.22)   // Re4 — primer ping
    ping(880,  ctx.currentTime + 0.13, 0.25, 0.28)   // La4 — segundo ping (ascendente)
    ping(1760, ctx.currentTime + 0.13, 0.07, 0.18)   // La5 — armónico suave (brillo)

    setTimeout(() => ctx.close(), 900)
  } catch { /* autoplay bloqueado */ }
}

// ── Chime suave de dos notas descendentes (E5 → C5) para comentarios ─────────
function playCommentSound() {
  try {
    type WA = Window & { webkitAudioContext?: typeof AudioContext }
    const Ctx = window.AudioContext ?? (window as WA).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()

    const chime = (freq: number, startAt: number, vol: number, dur: number) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'triangle'                                // timbre más suave que sine
      osc.frequency.value = freq
      gain.gain.setValueAtTime(vol, startAt)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur)
      osc.start(startAt); osc.stop(startAt + dur)
    }

    chime(659, ctx.currentTime,        0.18, 0.35)        // Mi5 — primer tono
    chime(523, ctx.currentTime + 0.20, 0.14, 0.40)        // Do5 — segundo tono (descendente)

    setTimeout(() => ctx.close(), 900)
  } catch { /* autoplay bloqueado */ }
}

// ── Notificación via Service Worker ──────────────────────────────────────────
function notificarViaSW(title: string, body: string, tag: string) {
  if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return

  const send = (sw: ServiceWorker | null) => {
    if (!sw) {
      try { new Notification(title, { body, icon: '/icons/icon-192.png', tag }) } catch { /**/ }
      return
    }
    sw.postMessage({ type: 'SHOW_NOTIFICATION', title, body, tag, url: '/admin/mensajes/bandeja' })
  }

  if (navigator.serviceWorker.controller) {
    send(navigator.serviceWorker.controller)
  } else {
    navigator.serviceWorker.ready.then(reg => send(reg.active)).catch(() => send(null))
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { profile } = useAuth()
  const { tienePermiso, getOrden } = usePermisos()
  const supabase = createClient()

  const [logoUrl, setLogoUrl]           = useState<string | null>(null)
  const [nombreNegocio, setNombreNegocio] = useState<string | null>(null)
  const [openGroups, setOpenGroups]     = useState<Record<string, boolean>>({ 'serv-tec': true, 'ventas': false, 'mensajes': false, 'comentarios': false })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // ── Notificaciones ───────────────────────────────────────────────────────
  const [unreadTotal, setUnreadTotal]   = useState(0)
  const [notifToast, setNotifToast]     = useState<NotifToast | null>(null)
  const [notifPerm, setNotifPerm]       = useState<NotificationPermission>('default')
  const [showNotifModal, setShowNotifModal] = useState(false)
  const [pushStatus, setPushStatus]     = useState<'idle' | 'ok' | 'error'>('idle')
  const [notifSupported, setNotifSupported] = useState(false)

  const prevConvsRef  = useRef<ConvSnap[]>([])
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Comentarios ──────────────────────────────────────────────────────────
  const [nuevosComentarios, setNuevosComentarios]   = useState(0)
  const [commentToast, setCommentToast]             = useState<string | null>(null)
  const prevNuevosComRef      = useRef<number>(0)
  const commentToastTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Recordatorios de Seguimiento Ventas vencidos ─────────────────────────
  const [recordatoriosVencidos, setRecordatoriosVencidos] = useState(0)

  const cargarRecordatorios = useCallback(async () => {
    if (!profile?.tenant_id || !profile?.id) return
    const { count } = await supabase
      .from('recordatorios')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', profile.tenant_id)
      .eq('asignado_a', profile.id)
      .eq('completado', false)
      .not('cliente_id', 'is', null)
      .lte('fecha_recordatorio', new Date().toISOString())
    setRecordatoriosVencidos(count ?? 0)
  }, [profile?.tenant_id, profile?.id])

  const mostrarToast = useCallback((t: NotifToast) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setNotifToast(t)
    toastTimerRef.current = setTimeout(() => setNotifToast(null), 5000)
  }, [])

  const cargarNoLeidos = useCallback(async (detectar = false) => {
    if (!profile?.tenant_id) return
    const { data } = await supabase
      .from('conversaciones')
      .select('id, no_leidos_count, ultimo_mensaje_at, ultimo_mensaje_texto, canal, canal_contact_id, clientes(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .in('estado', ['abierta', 'pendiente'])

    const convs = (data ?? []) as ConvSnap[]
    setUnreadTotal(convs.reduce((s, c) => s + (c.no_leidos_count ?? 0), 0))

    if (detectar && prevConvsRef.current.length > 0) {
      const isBandeja = pathname.startsWith('/admin/mensajes/bandeja')
      for (const conv of convs) {
        const prev = prevConvsRef.current.find(c => c.id === conv.id)
        const esNuevo =
          (conv.no_leidos_count ?? 0) > (prev?.no_leidos_count ?? 0) ||
          (!prev && (conv.no_leidos_count ?? 0) > 0)
        if (!esNuevo) continue

        const nombre = conv.clientes?.[0]?.nombre ?? conv.canal_contact_id
        const canal  = CANAL_LABEL[conv.canal] ?? conv.canal
        const texto  = conv.ultimo_mensaje_texto ?? ''

        playMsgSound()

        if (!isBandeja) mostrarToast({ nombre, canal, texto, convId: conv.id })

        notificarViaSW(
          `${CANAL_ICON[conv.canal] ?? '💬'} ${nombre}`,
          texto ? texto.slice(0, 120) : `Nuevo mensaje de ${canal}`,
          conv.id
        )
        break
      }
    }
    prevConvsRef.current = convs
  }, [profile?.tenant_id, pathname, mostrarToast])

  const cargarNuevosComentarios = useCallback(async (detectar = false) => {
    if (!profile?.tenant_id) return
    const { count } = await supabase
      .from('comentarios')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', profile.tenant_id)
      .eq('estado', 'nuevo')

    const total = count ?? 0
    setNuevosComentarios(total)

    if (detectar && total > prevNuevosComRef.current) {
      playCommentSound()
      if (!pathname.startsWith('/admin/comentarios')) {
        const diff = total - prevNuevosComRef.current
        const msg  = `${diff} comentario${diff > 1 ? 's' : ''} nuevo${diff > 1 ? 's' : ''}`
        if (commentToastTimerRef.current) clearTimeout(commentToastTimerRef.current)
        setCommentToast(msg)
        commentToastTimerRef.current = setTimeout(() => setCommentToast(null), 5000)
      }
    }
    prevNuevosComRef.current = total
  }, [profile?.tenant_id, pathname])

  // ── Suscribir a Web Push (funciona con Chrome cerrado) ───────────────────
  const suscribirPush = async () => {
    console.log('[push] suscribirPush() llamado')
    if (!('serviceWorker' in navigator)) { console.warn('[push] SW no soportado'); setPushStatus('error'); return }
    if (!('PushManager' in window))      { console.warn('[push] PushManager no soportado'); setPushStatus('error'); return }
    if (Notification.permission !== 'granted') { console.warn('[push] Permiso no concedido:', Notification.permission); setPushStatus('error'); return }
    try {
      console.log('[push] Paso 1: obteniendo clave VAPID...')
      const res = await fetch('/api/admin/mensajes/push-public-key')
      if (!res.ok) {
        console.warn('[push] VAPID no configurado:', res.status, await res.text())
        setPushStatus('error')
        return
      }
      const { publicKey } = await res.json()
      if (!publicKey) { console.warn('[push] publicKey vacía'); setPushStatus('error'); return }
      console.log('[push] Paso 2: VAPID recibido, convirtiendo a Uint8Array...')

      const padding = '='.repeat((4 - publicKey.length % 4) % 4)
      const base64  = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/')
      const raw     = window.atob(base64)
      const appKey  = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) appKey[i] = raw.charCodeAt(i)

      console.log('[push] Paso 3: buscando SW activo...')
      // serviceWorker.ready puede colgar si el SW falló al instalar → usar timeout de 8s
      const activeReg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<undefined>(r => setTimeout(() => r(undefined), 8000)),
      ])
      if (!activeReg) {
        // SW no activó en 8s — intentar con getRegistration directamente
        console.warn('[push] serviceWorker.ready timeout, intentando getRegistration...')
        const fallbackReg = await navigator.serviceWorker.getRegistration('/')
        if (!fallbackReg?.pushManager) {
          console.warn('[push] Sin pushManager disponible')
          setPushStatus('error')
          return
        }
        console.log('[push] SW via getRegistration, estado:', fallbackReg.active?.state)
        // Continuar con fallbackReg
        console.log('[push] Paso 4 (fallback): buscando suscripción existente...')
        let subFb = await fallbackReg.pushManager.getSubscription()
        if (!subFb) {
          subFb = await fallbackReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey })
          console.log('[push] Suscripción fallback creada:', subFb.endpoint.slice(0, 60))
        }
        console.log('[push] Paso 5 (fallback): guardando en DB...')
        const saveResFb = await fetch('/api/admin/mensajes/push-subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subFb }),
        })
        if (saveResFb.ok) { console.log('[push] ✓ guardado (fallback)'); setPushStatus('ok') }
        else { console.warn('[push] Error guardando (fallback):', await saveResFb.text()); setPushStatus('error') }
        return
      }
      console.log('[push] SW listo, estado:', activeReg.active?.state)

      console.log('[push] Paso 4: buscando suscripción existente...')
      let sub = await activeReg.pushManager.getSubscription()
      if (!sub) {
        console.log('[push] No hay suscripción, creando nueva...')
        sub = await activeReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey })
        console.log('[push] Suscripción creada:', sub.endpoint.slice(0, 60))
      } else {
        console.log('[push] Ya existe suscripción:', sub.endpoint.slice(0, 60))
      }

      console.log('[push] Paso 5: guardando en DB...')
      const saveRes = await fetch('/api/admin/mensajes/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      })
      if (saveRes.ok) {
        console.log('[push] ✓ Suscripción guardada')
        setPushStatus('ok')
      } else {
        const errText = await saveRes.text()
        console.warn('[push] Error guardando:', saveRes.status, errText)
        setPushStatus('error')
      }
    } catch (err) {
      console.warn('[push] Error al suscribir:', err)
      setPushStatus('error')
    }
  }

  // ── Activar notificaciones (requiere click del usuario) ──────────────────
  const activarNotificaciones = async () => {
    if (!('Notification' in window)) return
    if (notifPerm === 'denied') {
      setShowNotifModal(true)
      return
    }
    if (notifPerm === 'granted') {
      // Ya tiene permiso → re-sincronizar suscripción push
      suscribirPush()
      return
    }
    const result = await Notification.requestPermission()
    setNotifPerm(result)
    if (result === 'granted') {
      playMsgSound()
      setShowNotifModal(false)
      suscribirPush()
    }
  }

  // ── Registrar SW ─────────────────────────────────────────────────────────
  useEffect(() => {
    setNotifSupported('Notification' in window)
    if ('Notification' in window) setNotifPerm(Notification.permission)

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing
            sw?.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                sw.postMessage({ type: 'SKIP_WAITING' })
              }
            })
          })
        })
        .catch(err => console.warn('[SW] Error al registrar:', err))

      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'SW_NAV') router.push(e.data.url)
      })
    }

    cargarNoLeidos()
    cargarNuevosComentarios()
    cargarRecordatorios()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-suscribir push cuando el perfil carga ────────────────────────────
  useEffect(() => {
    if (!profile?.tenant_id) return
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return
    if (Notification.permission !== 'granted') return
    console.log('[push] Auto-suscribiendo (perfil cargado, permiso ya concedido)...')
    suscribirPush()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id])

  // ── Realtime global ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.tenant_id) return
    const ch = supabase
      .channel(`layout-${profile.tenant_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversaciones',
        filter: `tenant_id=eq.${profile.tenant_id}`,
      }, () => cargarNoLeidos(true))
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'comentarios',
        filter: `tenant_id=eq.${profile.tenant_id}`,
      }, () => cargarNuevosComentarios(true))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'comentarios',
        filter: `tenant_id=eq.${profile.tenant_id}`,
      }, () => cargarNuevosComentarios(false))
      .subscribe()
    const t = setInterval(() => { cargarNoLeidos(true); cargarNuevosComentarios(false); cargarRecordatorios() }, 20000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [profile?.tenant_id, cargarNoLeidos, cargarNuevosComentarios, cargarRecordatorios])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('tenants').select('logo_url, nombre_herramienta, nombre').eq('id', profile.tenant_id).single()
      .then(({ data }) => {
        setLogoUrl(data?.logo_url ?? null)
        setNombreNegocio(data?.nombre_herramienta || data?.nombre || null)
      })
  }, [profile?.tenant_id])

  useEffect(() => {
    for (const g of NAV_GROUPS) {
      if (g.items.some(i => pathname.startsWith(i.href)))
        setOpenGroups(p => ({ ...p, [g.key]: true }))
    }
  }, [pathname])

  // Cerrar el drawer móvil al navegar
  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  const filterAndSort = (items: NavItem[]) =>
    items
      .filter(i => {
        if (i.soloGerencia && profile?.rol !== 'gerencia') return false
        if (i.rolesPermitidos && !i.rolesPermitidos.includes(profile?.rol as 'gerencia' | 'dueno')) return false
        return i.seccion === null || tienePermiso(i.seccion)
      })
      .sort((a, b) => {
        const oa = a.seccion ? getOrden(a.seccion, a.defaultOrden) : a.defaultOrden
        const ob = b.seccion ? getOrden(b.seccion, b.defaultOrden) : b.defaultOrden
        return oa - ob
      })

  const standaloneItems            = filterAndSort(STANDALONE_NAV)
  const isBandejaActive            = pathname.startsWith('/admin/mensajes/bandeja')
  const isBandejaComentariosActive = pathname.startsWith('/admin/comentarios')
  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }

  const totalAlertasMobile = unreadTotal + nuevosComentarios + recordatoriosVencidos

  const sidebarContent = (
    <>
        {/* Logo */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-gray-50" onError={() => setLogoUrl(null)} />
            ) : (
              <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">OD</span>
              </div>
            )}
            <div className="min-w-0">
              <span className="font-bold text-gray-900 text-sm truncate block">{nombreNegocio || 'OptiDesk'}</span>
              <span className="text-xs text-gray-400 font-medium">v1.5</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_GROUPS.map((group, idx) => {
            const groupItems = filterAndSort(group.items)
            if (groupItems.length === 0) return null
            const isOpen       = openGroups[group.key]
            const esMensajes   = group.key === 'mensajes'
            const esComentarios = group.key === 'comentarios'
            return (
              <div key={group.key} className={idx > 0 ? 'mt-1' : ''}>
                <button
                  onClick={() => setOpenGroups(p => ({ ...p, [group.key]: !p[group.key] }))}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors uppercase tracking-wide"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{group.label}</span>
                    {esMensajes && unreadTotal > 0 && (
                      <span className="bg-red-500 text-white rounded-full text-xs font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                        {unreadTotal > 99 ? '99+' : unreadTotal}
                      </span>
                    )}
                    {esComentarios && nuevosComentarios > 0 && (
                      <span className="bg-orange-500 text-white rounded-full text-xs font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                        {nuevosComentarios > 99 ? '99+' : nuevosComentarios}
                      </span>
                    )}
                  </div>
                  <svg className={cn('w-3 h-3 transition-transform flex-shrink-0', isOpen ? 'rotate-90' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="mt-0.5 ml-2 space-y-0.5">
                    {groupItems.map(item => {
                      const esBandeja    = item.href === '/admin/mensajes/bandeja'
                      const esPubs       = item.href === '/admin/comentarios/bandeja'
                      const esVentas     = item.href === '/admin/ventas'

                      if (item.external) {
                        return (
                          <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer"
                            onClick={() => setMobileNavOpen(false)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs italic text-gray-500 hover:bg-gray-50 hover:text-blue-600 transition-colors border border-dashed border-gray-200"
                          >
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6v6M20 4L10 14" />
                            </svg>
                            <span className="truncate">{item.label}</span>
                          </a>
                        )
                      }

                      return (
                        <Link key={item.href} href={item.href}
                          onClick={() => setMobileNavOpen(false)}
                          className={cn(
                            'flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors',
                            (item.exactMatch ? pathname === item.href : pathname.startsWith(item.href))
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          )}
                        >
                          <span>{item.label}</span>
                          {esBandeja && unreadTotal > 0 && !isBandejaActive && (
                            <span className="bg-green-500 text-white rounded-full text-xs font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                              {unreadTotal > 99 ? '99+' : unreadTotal}
                            </span>
                          )}
                          {esPubs && nuevosComentarios > 0 && !isBandejaComentariosActive && (
                            <span className="bg-orange-500 text-white rounded-full text-xs font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                              {nuevosComentarios > 99 ? '99+' : nuevosComentarios}
                            </span>
                          )}
                          {esVentas && recordatoriosVencidos > 0 && (
                            <span className="bg-red-500 text-white rounded-full text-xs font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                              {recordatoriosVencidos > 99 ? '99+' : recordatoriosVencidos}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {standaloneItems.length > 0 && <div className="border-t border-gray-100 my-1" />}
          {standaloneItems.map(item => (
            <Link key={item.href} href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                'block px-3 py-2 rounded-lg text-sm transition-colors',
                pathname.startsWith(item.href)
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Perfil, notificaciones y logout */}
        <div className="p-3 border-t space-y-1">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-gray-900 truncate">{profile?.nombre}</p>
            <p className="text-xs text-gray-500 truncate">
              {profile?.rol === 'gerencia' ? 'Gerencia' : profile?.rol === 'dueno' ? 'Dueño' : 'Administración'}
            </p>
          </div>

          {/* Botón de activar notificaciones */}
          {notifSupported && (
            <button
              onClick={activarNotificaciones}
              title={notifPerm === 'granted' ? 'Haz clic para re-sincronizar notificaciones push' : 'Activar notificaciones del navegador'}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors',
                notifPerm === 'granted' && pushStatus !== 'error'
                  ? 'text-green-600 hover:bg-green-50'
                  : notifPerm === 'granted' && pushStatus === 'error'
                  ? 'text-yellow-600 hover:bg-yellow-50'
                  : 'text-orange-500 hover:bg-orange-50 font-medium'
              )}
            >
              <span className="text-sm">
                {notifPerm !== 'granted' ? '🔕' : pushStatus === 'ok' ? '🔔' : pushStatus === 'error' ? '⚠️' : '🔔'}
              </span>
              <span>
                {notifPerm !== 'granted'
                  ? 'Activar notificaciones'
                  : pushStatus === 'ok'
                  ? 'Notificaciones activas'
                  : pushStatus === 'error'
                  ? 'Error push — reintentar'
                  : 'Notificaciones activas'}
              </span>
            </button>
          )}

          <button onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            Cerrar sesión
          </button>
        </div>
    </>
  )

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {profile?.isStaging && (
        <div className="flex-shrink-0 bg-amber-400 text-amber-900 text-xs font-semibold text-center py-1 px-4 flex items-center justify-center gap-2">
          <span>⚠️</span>
          <span>ENTORNO DE PRUEBA — los datos aquí son independientes de producción</span>
          <span>⚠️</span>
        </div>
      )}

      {/* Top bar móvil — oculto en impresión para no contaminar PDF de cotizaciones */}
      <div className="md:hidden print:hidden flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-3 py-2.5">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="p-1.5 -ml-1.5 text-gray-600 hover:bg-gray-100 rounded-lg relative"
          aria-label="Abrir menú"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          {totalAlertasMobile > 0 && (
            <span className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full text-[10px] font-bold min-w-[16px] h-[16px] flex items-center justify-center leading-none">
              {totalAlertasMobile > 99 ? '99+' : totalAlertasMobile}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-6 h-6 rounded-md object-contain bg-gray-50" onError={() => setLogoUrl(null)} />
          ) : (
            <div className="w-6 h-6 bg-blue-700 rounded-md flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-[10px]">OD</span>
            </div>
          )}
          <span className="font-bold text-gray-900 text-sm truncate">{nombreNegocio || 'OptiDesk'}</span>
        </div>
        <div className="w-9" />
      </div>

      {/* Drawer móvil */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] h-full bg-white flex flex-col flex-shrink-0 shadow-2xl animate-slide-in-left">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
      <aside className="hidden md:flex print:hidden w-48 bg-white border-r border-gray-200 flex-col flex-shrink-0">
        {sidebarContent}
      </aside>

      <main className="flex-1 overflow-y-auto relative">
        {children}
        <ManualButton />
      </main>

      {/* Toast in-app */}
      {notifToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-white border border-gray-200 shadow-xl rounded-xl p-3.5 flex items-start gap-3 w-80 animate-slide-up">
          <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 text-lg mt-0.5">
            {CANAL_ICON[notifToast.canal === 'WhatsApp' ? 'whatsapp' : notifToast.canal === 'Messenger' ? 'messenger' : 'instagram'] ?? '💬'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <p className="text-xs font-semibold text-gray-900 truncate">{notifToast.nombre}</p>
              <span className="text-xs text-gray-400 flex-shrink-0">{notifToast.canal}</span>
            </div>
            {notifToast.texto
              ? <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{notifToast.texto}</p>
              : <p className="text-xs text-gray-400 italic">Nuevo mensaje</p>
            }
            <button
              onClick={() => { setNotifToast(null); router.push('/admin/mensajes/bandeja') }}
              className="mt-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 transition-colors"
            >
              Ver conversación →
            </button>
          </div>
          <button onClick={() => setNotifToast(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0 -mt-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Toast comentarios nuevos */}
      {commentToast && (
        <div className="fixed bottom-20 right-5 z-50 bg-white border border-orange-200 shadow-xl rounded-xl p-3.5 flex items-start gap-3 w-72 animate-slide-up">
          <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 text-lg mt-0.5">
            💬
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 mb-0.5">Comentarios</p>
            <p className="text-xs text-gray-600">{commentToast}</p>
            <button
              onClick={() => { setCommentToast(null); router.push('/admin/comentarios/bandeja') }}
              className="mt-1.5 text-xs font-semibold text-orange-600 hover:text-orange-800 transition-colors"
            >
              Ver comentarios →
            </button>
          </div>
          <button onClick={() => setCommentToast(null)} className="text-gray-300 hover:text-gray-500 flex-shrink-0 -mt-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Modal cuando notificaciones bloqueadas en Chrome */}
      {showNotifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNotifModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="text-3xl mb-3 text-center">🔕</div>
            <h3 className="font-bold text-gray-900 text-center mb-2">Notificaciones bloqueadas</h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              Chrome bloqueó el permiso. Para activarlas:
            </p>
            <ol className="text-sm text-gray-700 space-y-1.5 mb-5 list-decimal list-inside">
              <li>Haz click en el <strong>candado 🔒</strong> en la barra de Chrome</li>
              <li>Busca <strong>&quot;Notificaciones&quot;</strong></li>
              <li>Cambia a <strong>&quot;Permitir&quot;</strong></li>
              <li>Recarga la página</li>
            </ol>
            <button onClick={() => setShowNotifModal(false)}
              className="w-full py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">
              Entendido
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
