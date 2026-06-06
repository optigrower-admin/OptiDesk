'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const ROL_RUTAS: Record<string, string> = {
  control_total: '/control_total/tenants',
  gerencia: '/admin/ordenes',
  admin: '/admin/ordenes',
  mecanico: '/mecanico',
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<{ error: string } | void> {
  const cookieStore = cookies()

  // El cliente SSR guarda el JWT de sesión en cookies y lo usa en queries REST.
  // El JWT de sesión sí es un JWT válido que PostgREST puede verificar.
  // (sb_secret_* / sb_publishable_* son tokens opacos que PostgREST no acepta como JWT)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) return { error: authError.message }

  const user = authData.user
  if (!user) return { error: 'No se pudo obtener la sesión tras el login' }

  // Usar el cliente autenticado: su JWT de sesión satisface la política
  // "mecanico_read_own" (id = auth.uid()) sin necesitar bypasear RLS
  const { data: usuario, error: dbError } = await supabase
    .from('usuarios')
    .select('rol, activo')
    .eq('id', user.id)
    .single()

  if (dbError) return { error: `Error al cargar perfil: ${dbError.message}` }
  if (!usuario) return { error: 'Usuario no registrado en el sistema. Contacta al administrador.' }
  if (!usuario.activo) return { error: 'Tu cuenta está inactiva. Contacta al administrador.' }

  redirect(ROL_RUTAS[usuario.rol] ?? '/login')
}
