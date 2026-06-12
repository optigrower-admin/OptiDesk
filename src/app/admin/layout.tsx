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

type ConvSnap = { id: string; no_leidos_count: number; ultimo_mensaje_at: string | null }
type NotifToast = { nombre: string; canal: string; convId: string }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useAuth()
  const { tienePermiso, getOrden } = usePermisos()
  const supabase = createClient()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [nombreNegocio, setNombreNegocio] = useState<string | null>(null)

  // Estado de apertura por grupo
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'serv-tec': true,
    'mensajes': false,
  })

  // ── Mensajes no leídos (badge + notificaciones) ─────────────────────────
  const [unreadTotal, setUnreadTotal]   = useState(0)
  const [notifToast, setNotifToast]     = useState<NotifToast | null>(null)
  const prevConvsRef  = useRef<ConvSnap[]>([])
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostrarToast = useCallback((toast: NotifToast) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setNotifToast(toast)
    toastTimerRef.current = setTimeout(() => setNotifToast(null), 4000)
  }, [])

  const cargarNoLeidos = useCallback(async (detectarNuevos = false) => {
    if (!profile?.tenant_id) return
    const { data } = await supabase
      .from('conversaciones')
      .select('id, no_leidos_count, ultimo_mensaje_at, canal, canal_contact_id, clientes(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .in('estado', ['abierta', 'pendiente'])

    const convs = (data ?? []) as (ConvSnap & { canal: string; canal_contact_id: string; clientes: { nombre: string | null }[] | null })[]
    const total = convs.reduce((s, c) => s + (c.no_leidos_count ?? 0), 0)
    setUnreadTotal(total)

    if (detectarNuevos && prevConvsRef.current.length > 0) {
      const isBandeja = pathname.startsWith('/admin/mensajes/bandeja')
      for (const conv of convs) {
        const prev = prevConvsRef.current.find(c => c.id === conv.id)
        const esMensajeNuevo =
          (conv.no_leidos_count ?? 0) > (prev?.no_leidos_count ?? 0) ||
          (!prev && (conv.no_leidos_count ?? 0) > 0)

        if (!esMensajeNuevo) continue

        const nombre = conv.clientes?.[0]?.nombre ?? conv.canal_contact_id
        const canal  = CANAL_LABEL[conv.canal] ?? conv.canal

        // Toast in-app (siempre, incluso en bandeja muestra brevemente)
        if (!isBandeja) mostrarToast({ nombre, canal, convId: conv.id })

        // Notificación del browser cuando no tiene foco o está en otra página
        if ('Notification' in window && Notification.permission === 'granted') {
          if (document.hidden || !document.hasFocus() || !isBandeja) {
            new Notification(`OptiDesk — ${nombre}`, {
              body: `Nuevo mensaje de ${canal}`,
              icon: '/icons/icon-192.png',
              tag: conv.id,
            }).addEventListener('click', () => {
              window.focus()
              router.push('/admin/mensajes/bandeja')
            })
          }
        }
        break // una sola notificación a la vez
      }
    }

    prevConvsRef.current = convs.map(c => ({
      id: c.id,
      no_leidos_count: c.no_leidos_count ?? 0,
      ultimo_mensaje_at: c.ultimo_mensaje_at,
    }))
  }, [profile?.tenant_id, pathname, mostrarToast, router])

  // Pedir permiso de notificaciones y cargar no leídos al montar
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    cargarNoLeidos()
  }, [cargarNoLeidos])

  // Suscripción Realtime en toda la sesión
  useEffect(() => {
    if (!profile?.tenant_id) return

    const ch = supabase
      .channel(`layout-convs-${profile.tenant_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversaciones',
        filter: `tenant_id=eq.${profile.tenant_id}`,
      }, () => cargarNoLeidos(true))
      .subscribe()

    // Fallback cada 20s
    const t = setInterval(() => cargarNoLeidos(true), 20000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [profile?.tenant_id, cargarNoLeidos])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('tenants').select('logo_url, nombre_herramienta, nombre').eq('id', profile.tenant_id).single()
      .then(({ data }) => {
        setLogoUrl(data?.logo_url ?? null)
        setNombreNegocio(data?.nombre_herramienta || data?.nombre || null)
      })
  }, [profile?.tenant_id])

  // Auto-abrir el grupo al navegar
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      if (group.items.some(item => pathname.startsWith(item.href)))
        setOpenGroups(prev => ({ ...prev, [group.key]: true }))
    }
  }, [pathname])

  const filterAndSort = (items: NavItem[]) =>
    items
      .filter(item => {
        if (item.soloGerencia && profile?.rol !== 'gerencia') return false
        return item.seccion === null || tienePermiso(item.seccion)
      })
      .sort((a, b) => {
        const oa = a.seccion ? getOrden(a.seccion, a.defaultOrden) : a.defaultOrden
        const ob = b.seccion ? getOrden(b.seccion, b.defaultOrden) : b.defaultOrden
        return oa - ob
      })

  const standaloneItems = filterAndSort(STANDALONE_NAV)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))

  const isBandejaActive = pathname.startsWith('/admin/mensajes/bandeja')

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-48 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Logo y nombre */}
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

            // Badge de no leídos en el header del grupo Mensajes
            const esMensajes = group.key === 'mensajes'

            return (
              <div key={group.key} className={idx > 0 ? 'mt-1' : ''}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors uppercase tracking-wide"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{group.label}</span>
                    {esMensajes && unreadTotal > 0 && (
                      <span className="bg-red-500 text-white rounded-full text-xs font-bold leading-none px-1.5 py-0.5 min-w-[18px] text-center">
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
                      const isBandeja = item.href === '/admin/mensajes/bandeja'
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors',
                            pathname.startsWith(item.href)
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          )}
                        >
                          <span>{item.label}</span>
                          {isBandeja && unreadTotal > 0 && !isBandejaActive && (
                            <span className="bg-green-500 text-white rounded-full text-xs font-bold leading-none px-1.5 py-0.5 min-w-[18px] text-center">
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
            <Link
              key={item.href}
              href={item.href}
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

        {/* Perfil y logout */}
        <div className="p-3 border-t">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-gray-900 truncate">{profile?.nombre}</p>
            <p className="text-xs text-gray-500 truncate">
              {profile?.rol === 'gerencia' ? 'Gerencia' : 'Administración'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Toast in-app — aparece cuando llega mensaje y no estás en bandeja */}
      {notifToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-white border border-gray-200 shadow-xl rounded-xl p-3.5 flex items-center gap-3 max-w-72 animate-slide-up">
          <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 text-base">
            {notifToast.canal === 'WhatsApp' ? '📱' : notifToast.canal === 'Messenger' ? '💬' : '📸'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate">{notifToast.nombre}</p>
            <p className="text-xs text-gray-500">Nuevo mensaje · {notifToast.canal}</p>
          </div>
          <button
            onClick={() => { setNotifToast(null); router.push('/admin/mensajes/bandeja') }}
            className="flex-shrink-0 text-xs font-semibold text-blue-700 hover:text-blue-900 transition-colors"
          >
            Ver
          </button>
        </div>
      )}
    </div>
  )
}
