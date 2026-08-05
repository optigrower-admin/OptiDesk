'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermisos } from '@/hooks/usePermisos'
import { useAuth } from '@/hooks/useAuth'
import { usePresenciaHeartbeat } from '@/hooks/usePresenciaHeartbeat'
import { cn } from '@/lib/utils'

const ALL_NAV = [
  {
    href: '/mecanico',
    label: 'Inicio',
    exact: true,
    seccion: 'servicio_tecnico',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/mecanico/recepcion/nueva',
    label: 'Nueva',
    exact: false,
    seccion: 'servicio_tecnico',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    href: '/mecanico/calendario',
    label: 'Calendario',
    exact: false,
    seccion: 'servicio_tecnico',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/mecanico/perfil',
    label: 'Mi perfil',
    exact: false,
    seccion: null,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    href: '/mecanico/uso',
    label: 'Mi Uso',
    exact: false,
    seccion: null,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l7 4v9M9 19H4v-9l5-3m0 12h7m-7-9v9" />
      </svg>
    ),
  },
]

export default function MecanicoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { tienePermiso } = usePermisos()
  const { profile } = useAuth()
  usePresenciaHeartbeat(!!profile?.id)

  const navItems = ALL_NAV.filter((item) => item.seccion === null || tienePermiso(item.seccion))

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {profile?.isStaging && (
        <div className="bg-amber-400 text-amber-900 text-xs font-semibold text-center py-1 px-4">
          ⚠️ ENTORNO DE PRUEBA
        </div>
      )}
      <header className="sticky top-0 z-10 bg-blue-700 text-white px-4 py-3 flex items-center justify-between shadow">
        <div>
          <span className="font-bold text-lg">OptiDesk</span>
          <span className="text-blue-300 text-xs ml-2">Profesional</span>
        </div>
        <button onClick={handleLogout} className="text-blue-200 hover:text-white text-sm transition-colors">
          Salir
        </button>
      </header>

      <main>{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-10">
        {navItems.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          const esNuevaRecepcion = item.href === '/mecanico/recepcion/nueva'
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={esNuevaRecepcion ? (e) => {
                // "Nueva" siempre debe abrir un formulario en blanco. Una
                // navegación normal puede reutilizar la instancia de React de
                // la recepción anterior (o un borrador de otra moto) y mostrar
                // datos de una moto pasada — se fuerza una recarga completa.
                e.preventDefault()
                try { localStorage.removeItem('optiDesk_recepcion_draft') } catch { /* ignore */ }
                window.location.href = item.href
              } : undefined}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors',
                isActive ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
