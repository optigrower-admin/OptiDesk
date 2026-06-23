'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface TenantSimple { id: string; nombre: string }

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
  { href: '/control_total/herramientas',  label: 'Herramientas' },
  { href: '/control_total/sandbox',       label: 'Entornos de prueba' },
]

const ROLES = [
  { value: 'gerencia', label: 'Gerencia' },
  { value: 'dueno', label: 'Dueño' },
  { value: 'admin', label: 'Administración' },
  { value: 'mecanico', label: 'Profesional' },
]

export default function ControlTotalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [tenants, setTenants] = useState<TenantSimple[]>([])
  const [simTenant, setSimTenant] = useState('')
  const [simRol, setSimRol] = useState('')

  useEffect(() => {
    supabase.from('tenants').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => {
      if (data) setTenants(data as TenantSimple[])
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleSimular = () => {
    if (!simTenant || !simRol) return
    router.push(`/control_total/simular?tenant=${simTenant}&rol=${simRol}`)
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

        {/* Vista simulada — Ver como rol */}
        <div className="p-3 border-t border-gray-100 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ver como...</p>
          <select
            value={simTenant}
            onChange={(e) => setSimTenant(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white"
          >
            <option value="">Empresa</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
          <select
            value={simRol}
            onChange={(e) => setSimRol(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400 bg-white"
          >
            <option value="">Rol</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={handleSimular}
            disabled={!simTenant || !simRol}
            className={cn(
              'w-full py-1.5 px-3 rounded-lg text-xs font-medium transition-colors',
              simTenant && simRol
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            )}
          >
            Simular vista
          </button>
          {pathname.startsWith('/control_total/simular') && (
            <Link
              href="/control_total/dashboard"
              className="block text-center text-xs text-purple-600 hover:text-purple-800 underline"
            >
              ← Salir de simulación
            </Link>
          )}
        </div>

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
