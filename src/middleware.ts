import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() valida el JWT de sesión desde la cookie y lo carga en el cliente.
  // Después de esta llamada, supabase.from(...) incluye ese JWT en Authorization Bearer,
  // lo que satisface la política RLS "mecanico_read_own" (id = auth.uid()).
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isMobile = /Mobile|Android|iPhone|iPod/i.test(request.headers.get('user-agent') ?? '')

  // Rutas que se autentican con su propio esquema (CRON_SECRET / API key /
  // firma de webhook), no con sesión de usuario — el middleware no debe
  // interceptarlas ni redirigirlas a /login.
  if (pathname.startsWith('/api/cron/') || pathname.startsWith('/api/v1/') || pathname.startsWith('/api/webhooks/')) {
    return supabaseResponse
  }

  // Rutas públicas
  if (pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/privacy') || pathname.startsWith('/terms') || pathname.startsWith('/docs/')) {
    if (user) {
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('rol')
        .eq('id', user.id)
        .single()

      if (usuario) {
        return NextResponse.redirect(new URL(getRolRoute(usuario.rol, isMobile), request.url))
      }
    }
    return supabaseResponse
  }

  // Rutas protegidas — requieren sesión
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, activo')
    .eq('id', user.id)
    .single()

  if (!usuario || !usuario.activo) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?error=cuenta_inactiva', request.url))
  }

  // Verificar acceso por rol
  if (pathname.startsWith('/control_total') && usuario.rol !== 'control_total') {
    return NextResponse.redirect(new URL(getRolRoute(usuario.rol, isMobile), request.url))
  }

  if (pathname.startsWith('/admin') && !['admin', 'gerencia', 'control_total', 'dueno', 'freelancer'].includes(usuario.rol)) {
    return NextResponse.redirect(new URL(getRolRoute(usuario.rol, isMobile), request.url))
  }

  if (pathname.startsWith('/mecanico') && !['mecanico', 'admin', 'gerencia', 'control_total'].includes(usuario.rol)) {
    return NextResponse.redirect(new URL(getRolRoute(usuario.rol, isMobile), request.url))
  }

  return supabaseResponse
}

function getRolRoute(rol: string, isMobile: boolean): string {
  switch (rol) {
    case 'control_total': return '/control_total/tenants'
    case 'gerencia': return '/admin/ordenes'
    case 'admin': return isMobile ? '/admin/movil' : '/admin/ordenes'
    case 'dueno': return '/admin/dashboard/servicio-tecnico'
    case 'freelancer': return '/admin/ventas'
    case 'mecanico': return '/mecanico'
    default: return '/login'
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|.*\\.png$).*)',
  ],
}
