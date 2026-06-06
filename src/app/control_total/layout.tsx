'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/control_total/dashboard',     label: 'Dashboard' },
  { href: '/control_total/tenants',       label: 'Empresas' },
  { href: '/control_total/usuarios',      label: 'Usuarios' },
  { href: '/control_total/permisos',      label: 'Permisos roles' },
  { href: '/control_total/metodos-pago',  label: 'Métodos de pago' },
  { href: '/control_total/tipos-servicio', label: 'Tipos de servicio' },
  { href: '/control_total/catalogo-uma',  label: 'Catálogo UMA' },
  { href: '/control_total/storage',       label: 'Storage' },
  { href: '/control_total/auditoria',     label: 'Auditoría global' },
]

export default function ControlTotalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-52 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">SA</span>
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">OptiDesk</p>
              <p className="text-xs text-purple-600">Control Total</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block px-3 py-2 rounded-lg text-sm transition-colors',
                pathname.startsWith(item.href)
                  ? 'bg-purple-50 text-purple-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t">
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
