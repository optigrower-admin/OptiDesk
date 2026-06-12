'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  seccion: string | null
  soloGerencia: boolean
  defaultOrden: number
}

type NavGroup = {
  key: string
  label: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'serv-tec',
    label: 'Serv Tec & Rep',
    items: [
      { href: '/admin/ordenes',         label: 'Servicio Técnico',   seccion: 'servicio_tecnico', soloGerencia: false, defaultOrden: 10  },
      { href: '/admin/repuestos',       label: 'Repuestos',          seccion: 'repuestos',        soloGerencia: false, defaultOrden: 20  },
      { href: '/admin/inventario',      label: 'Inventario',         seccion: 'inventario',       soloGerencia: false, defaultOrden: 30  },
      { href: '/admin/clientes',        label: 'Clientes',           seccion: 'clientes',         soloGerencia: false, defaultOrden: 40  },
      { href: '/admin/motos',           label: 'Motos',              seccion: 'motos',            soloGerencia: false, defaultOrden: 50  },
      { href: '/admin/config-servicio', label: 'Config Serv. Téc.',  seccion: null,               soloGerencia: true,  defaultOrden: 85  },
    ],
  },
  {
    key: 'mensajes',
    label: 'Mensajes',
    items: [
      { href: '/admin/mensajes/bandeja',    label: 'Bandeja',       seccion: null, soloGerencia: false, defaultOrden: 100 },
      { href: '/admin/mensajes/conexion',   label: 'Conexión Meta', seccion: null, soloGerencia: true,  defaultOrden: 110 },
      { href: '/admin/mensajes/plantillas', label: 'Plantillas',    seccion: null, soloGerencia: false, defaultOrden: 120 },
      { href: '/admin/mensajes/flujos',     label: 'Flujos',        seccion: null, soloGerencia: false, defaultOrden: 130 },
    ],
  },
]

const STANDALONE_NAV: NavItem[] = [
  { href: '/admin/reportes',  label: 'Reportes',  seccion: 'reportes',  soloGerencia: false, defaultOrden: 60  },
  { href: '/admin/auditoria', label: 'Auditoría', seccion: 'auditoria', soloGerencia: false, defaultOrden: 70  },
  { href: '/admin/equipo',    label: 'Mi equipo', seccion: null,        soloGerencia: true,  defaultOrden: 80  },
  { href: '/admin/perfil',    label: 'Mi perfil', seccion: null,        soloGerencia: false, defaultOrden: 999 },
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

type NotifToast = {
  nombre: string
  canal: string
  texto: string
  convId: string
}

// ── Sonido de mensaje (Web Audio API, sin archivos) ───────────────────────────
function playMsgSound() {
  try {
    type WinAudio = Window & { webkitAudioContext?: typeof AudioContext }
    const Ctx = window.AudioContext ?? (window as WinAudio).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.45)
    osc.onended = () => ctx.close()
  } catch { /* autoplay bloqueado o no soportado */ }
}

// ── Notificación via Service Worker (funciona con Chrome en otra ventana) ─────
function notificarViaSW(title: string, body: string, tag: string) {
  if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return

  const send = (sw: ServiceWorker | null) => {
    if (!sw) {
      // Fallback sin SW
      try { new Notification(title, { body, icon: '/icons/icon-192.png', tag }) } catch { /* ok */ }
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
  const router = useRouter()
  const { profile } = useAuth()
  const { tienePermiso, getOrden } = usePermisos()
  const supabase = createClient()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [nombreNegocio, setNombreNegocio] = useState<string | null>(null)

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'serv-tec': true,
    'mensajes': false,
  })

  // ── Estado de no leídos + toast ──────────────────────────────────────────
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [notifToast, setNotifToast]   = useState<NotifToast | null>(null)
  const prevConvsRef  = useRef<ConvSnap[]>([])
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    const total = convs.reduce((s, c) => s + (c.no_leidos_count ?? 0), 0)
    setUnreadTotal(total)

    if (detectar && prevConvsRef.current.length > 0) {
      const isBandeja = pathname.startsWith('/admin/mensajes/bandeja')

      for (const conv of convs) {
        const prev = prevConvsRef.current.find(c => c.id === conv.id)
        const esMensajeNuevo =
          (conv.no_leidos_count ?? 0) > (prev?.no_leidos_count ?? 0) ||
          (!prev && (conv.no_leidos_count ?? 0) > 0)
        if (!esMensajeNuevo) continue

        const nombre = conv.clientes?.[0]?.nombre ?? conv.canal_contact_id
        const canal  = CANAL_LABEL[conv.canal] ?? conv.canal
        const texto  = conv.ultimo_mensaje_texto ?? ''

        // Sonido siempre que llegue un mensaje
        playMsgSound()

        // Toast in-app cuando no está en bandeja
        if (!isBandeja) {
          mostrarToast({ nombre, canal, texto, convId: conv.id })
        }

        // Notificación del browser/OS via Service Worker
        notificarViaSW(
          `${CANAL_ICON[conv.canal] ?? '💬'} ${nombre}`,
          texto ? `${texto.slice(0, 100)}` : `Nuevo mensaje de ${canal}`,
          conv.id
        )
        break
      }
    }

    prevConvsRef.current = convs
  }, [profile?.tenant_id, pathname, mostrarToast])

  // ── Registrar SW + pedir permiso de notificaciones ───────────────────────
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* silencioso */ })

      // Cuando el SW nos avisa que el usuario hizo click en la notificación
      navigator.serviceWorker.addEventListener('message', (e) => {
        if (e.data?.type === 'SW_NAV' && e.data.url) router.push(e.data.url)
      })
    }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    cargarNoLeidos()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Realtime global (toda la sesión) ─────────────────────────────────────
  useEffect(() => {
    if (!profile?.tenant_id) return

    const ch = supabase
      .channel(`layout-${profile.tenant_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversaciones',
        filter: `tenant_id=eq.${profile.tenant_id}`,
      }, () => cargarNoLeidos(true))
      .subscribe()

    const fallback = setInterval(() => cargarNoLeidos(true), 20000)
    return () => { supabase.removeChannel(ch); clearInterval(fallback) }
  }, [profile?.tenant_id, cargarNoLeidos])

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
        setOpenGroups(prev => ({ ...prev, [g.key]: true }))
    }
  }, [pathname])

  const filterAndSort = (items: NavItem[]) =>
    items
      .filter(i => {
        if (i.soloGerencia && profile?.rol !== 'gerencia') return false
        return i.seccion === null || tienePermiso(i.seccion)
      })
      .sort((a, b) => {
        const oa = a.seccion ? getOrden(a.seccion, a.defaultOrden) : a.defaultOrden
        const ob = b.seccion ? getOrden(b.seccion, b.defaultOrden) : b.defaultOrden
        return oa - ob
      })

  const standaloneItems = filterAndSort(STANDALONE_NAV)
  const isBandejaActive = pathname.startsWith('/admin/mensajes/bandeja')

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-48 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-gray-50" onError={() => setLogoUrl(null)} />
            ) : (
              <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">OD</span>
              </div>
            )}
            <span className="font-bold text-gray-900 text-sm truncate">{nombreNegocio || 'OptiDesk'}</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_GROUPS.map((group, idx) => {
            const groupItems = filterAndSort(group.items)
            if (groupItems.length === 0) return null
            const isOpen = openGroups[group.key]
            const esMensajes = group.key === 'mensajes'

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
                  </div>
                  <svg className={cn('w-3 h-3 transition-transform flex-shrink-0', isOpen ? 'rotate-90' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="mt-0.5 ml-2 space-y-0.5">
                    {groupItems.map(item => {
                      const esBandeja = item.href === '/admin/mensajes/bandeja'
                      return (
                        <Link key={item.href} href={item.href}
                          className={cn(
                            'flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors',
                            pathname.startsWith(item.href)
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

        <div className="p-3 border-t">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-gray-900 truncate">{profile?.nombre}</p>
            <p className="text-xs text-gray-500 truncate">
              {profile?.rol === 'gerencia' ? 'Gerencia' : 'Administración'}
            </p>
          </div>
          <button onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Toast in-app — esquina inferior derecha */}
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
            {notifToast.texto ? (
              <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{notifToast.texto}</p>
            ) : (
              <p className="text-xs text-gray-400 italic">Nuevo mensaje</p>
            )}
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
    </div>
  )
}
