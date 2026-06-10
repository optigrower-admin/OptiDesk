'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { cn } from '@/lib/utils'

const SERV_TEC_ITEMS = [
  { href: '/admin/ordenes',         label: 'Servicio Técnico',   seccion: 'servicio_tecnico', soloGerencia: false, defaultOrden: 10  },
  { href: '/admin/repuestos',       label: 'Repuestos',          seccion: 'repuestos',        soloGerencia: false, defaultOrden: 20  },
  { href: '/admin/inventario',      label: 'Inventario',         seccion: 'inventario',       soloGerencia: false, defaultOrden: 30  },
  { href: '/admin/clientes',        label: 'Clientes',           seccion: 'clientes',         soloGerencia: false, defaultOrden: 40  },
  { href: '/admin/motos',           label: 'Motos',              seccion: 'motos',            soloGerencia: false, defaultOrden: 50  },
  { href: '/admin/config-servicio', label: 'Config Serv. Téc.',  seccion: null,               soloGerencia: true,  defaultOrden: 85  },
]

const OTHER_NAV = [
  { href: '/admin/reportes',  label: 'Reportes',  seccion: 'reportes',  soloGerencia: false, defaultOrden: 60  },
  { href: '/admin/auditoria', label: 'Auditoría', seccion: 'auditoria', soloGerencia: false, defaultOrden: 70  },
  { href: '/admin/equipo',    label: 'Mi equipo', seccion: null,        soloGerencia: true,  defaultOrden: 80  },
  { href: '/admin/perfil',    label: 'Mi perfil', seccion: null,        soloGerencia: false, defaultOrden: 999 },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useAuth()
  const { tienePermiso, getOrden } = usePermisos()
  const supabase = createClient()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [nombreNegocio, setNombreNegocio] = useState<string | null>(null)
  const [servTecOpen, setServTecOpen] = useState(true)

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('tenants').select('logo_url, nombre_herramienta, nombre').eq('id', profile.tenant_id).single()
      .then(({ data }) => {
        setLogoUrl(data?.logo_url ?? null)
        setNombreNegocio(data?.nombre_herramienta || data?.nombre || null)
      })
  }, [profile?.tenant_id])

  // Auto-abrir grupo si la ruta actual es de Serv Tec & Rep
  useEffect(() => {
    const isInGroup = SERV_TEC_ITEMS.some(item => pathname.startsWith(item.href))
    if (isInGroup) setServTecOpen(true)
  }, [pathname])

  const filterAndSort = (items: typeof SERV_TEC_ITEMS) =>
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

  const servTecItems = filterAndSort(SERV_TEC_ITEMS)
  const otherItems   = filterAndSort(OTHER_NAV)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-48 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Logo y nombre negocio */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="w-8 h-8 rounded-lg object-contain bg-gray-50"
                onError={() => setLogoUrl(null)}
              />
            ) : (
              <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">OD</span>
              </div>
            )}
            <span className="font-bold text-gray-900 text-sm truncate">
              {nombreNegocio || 'OptiDesk'}
            </span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {/* Grupo: Serv Tec & Rep */}
          {servTecItems.length > 0 && (
            <div className="mb-1">
              <button
                onClick={() => setServTecOpen(o => !o)}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors uppercase tracking-wide"
              >
                <span>Serv Tec &amp; Rep</span>
                <svg
                  className={cn('w-3 h-3 transition-transform flex-shrink-0', servTecOpen ? 'rotate-90' : '')}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {servTecOpen && (
                <div className="mt-0.5 ml-2 space-y-0.5">
                  {servTecItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'block px-3 py-1.5 rounded-lg text-xs transition-colors',
                        pathname.startsWith(item.href)
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Divisor */}
          {servTecItems.length > 0 && otherItems.length > 0 && (
            <div className="border-t border-gray-100 my-1" />
          )}

          {/* Items fuera del grupo */}
          {otherItems.map((item) => (
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
    </div>
  )
}
