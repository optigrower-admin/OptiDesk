'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface UsuarioProfile {
  id: string
  nombre: string
  email: string
  rol: 'mecanico' | 'admin' | 'gerencia' | 'control_total' | 'dueno'
  tenant_id: string
  sandbox_tenant_id: string | null
  pin: string | null
  isStaging?: boolean
}

const detectStaging = () =>
  typeof window !== 'undefined' && window.location.hostname.includes('staging')

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UsuarioProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const isStaging = detectStaging()

    const fetchProfile = async (authUser: User) => {
      const { data } = await supabase
        .from('usuarios')
        .select('id, nombre, email, rol, tenant_id, sandbox_tenant_id, pin')
        .eq('id', authUser.id)
        .single()

      if (!data) { setProfile(null); return }

      // En staging, si el usuario tiene sandbox asignado, se usa ese tenant
      // en todos los componentes que lean profile.tenant_id
      const effectiveTenantId =
        isStaging && data.sandbox_tenant_id ? data.sandbox_tenant_id : data.tenant_id

      setProfile({ ...data, tenant_id: effectiveTenantId, isStaging })
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) fetchProfile(user).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  return { user, profile, loading, role: profile?.rol, tenantId: profile?.tenant_id }
}
