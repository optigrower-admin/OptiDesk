'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermisos } from '@/hooks/usePermisos'
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
]

export default function MecanicoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { tienePermiso } = usePermisos()

  const navItems = ALL_NAV.filter((item) => item.seccion === null || tienePermiso(item.seccion))

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="sticky top-0 z-10 bg-blue-700 text-white px-4 py-3 flex items-center justify-between shadow">
        <div>
          <span className="font-bold text-lg">OptiDesk</span>
          <span className="text-blue-300 text-xs ml-2">Prof. Mecánica</span>
        </div>
        <button onClick={handleLogout} className="text-blue-200 hover:text-white text-sm transition-colors">
          Salir
        </button>
      </header>

      <main>{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-10">
        {navItems.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
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
