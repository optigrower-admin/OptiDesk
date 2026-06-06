'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { usePermisos } from '@/hooks/usePermisos'
import { cn } from '@/lib/utils'

// defaultOrden define el orden por defecto cuando no hay fila en DB
const ALL_NAV = [
  { href: '/admin/ordenes',    label: 'Servicio Técnico', seccion: 'servicio_tecnico', soloGerencia: false, defaultOrden: 10  },
  { href: '/admin/repuestos',  label: 'Repuestos',        seccion: 'repuestos',        soloGerencia: false, defaultOrden: 20  },
  { href: '/admin/inventario', label: 'Inventario',       seccion: 'inventario',       soloGerencia: false, defaultOrden: 30  },
  { href: '/admin/clientes',   label: 'Clientes',         seccion: 'clientes',         soloGerencia: false, defaultOrden: 40  },
  { href: '/admin/motos',      label: 'Motos',            seccion: 'motos',            soloGerencia: false, defaultOrden: 50  },
  { href: '/admin/reportes',   label: 'Reportes',         seccion: 'reportes',         soloGerencia: false, defaultOrden: 60  },
  { href: '/admin/auditoria',  label: 'Auditoría',        seccion: 'auditoria',        soloGerencia: false, defaultOrden: 70  },
  { href: '/admin/equipo',          label: 'Mi equipo',          seccion: null, soloGerencia: true,  defaultOrden: 80  },
  { href: '/admin/config-servicio', label: 'Config. ServTec y Repuestos', seccion: null, soloGerencia: true, defaultOrden: 85 },
  { href: '/admin/perfil',          label: 'Mi perfil',          seccion: null, soloGerencia: false, defaultOrden: 999 },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useAuth()
  const { tienePermiso, getOrden } = usePermisos()
  const supabase = createClient()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [nombreNegocio, setNombreNegocio] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('tenants').select('logo_url, nombre_herramienta, nombre').eq('id', profile.tenant_id).single()
      .then(({ data }) => {
        setLogoUrl(data?.logo_url ?? null)
        setNombreNegocio(data?.nombre_herramienta || data?.nombre || null)
      })
  }, [profile?.tenant_id])

  const navItems = ALL_NAV
    .filter((item) => {
      if (item.soloGerencia && profile?.rol !== 'gerencia') return false
      return item.seccion === null || tienePermiso(item.seccion)
    })
    .sort((a, b) => {
      const oa = a.seccion ? getOrden(a.seccion, a.defaultOrden) : a.defaultOrden
      const ob = b.seccion ? getOrden(b.seccion, b.defaultOrden) : b.defaultOrden
      return oa - ob
    })

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

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
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

        <div className="p-3 border-t">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-gray-900 truncate">{profile?.nombre}</p>
            <p className="text-xs text-gray-500 truncate">
              {profile?.rol === 'gerencia' ? 'Gerencia' : 'Administrador Área'}
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
