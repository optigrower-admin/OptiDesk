'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

interface PermisoData { habilitado: boolean; orden: number }

const cache = new Map<string, Map<string, PermisoData>>()

export function clearPermisosCache(tenantId?: string, rol?: string) {
  if (tenantId && rol) cache.delete(`${tenantId}:${rol}`)
  else cache.clear()
}

export function usePermisos() {
  const { profile } = useAuth()
  const supabase = createClient()
  const [permisos, setPermisos] = useState<Map<string, PermisoData>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.tenant_id || !profile.rol || profile.rol === 'control_total') {
      setPermisos(new Map())
      setLoading(false)
      return
    }

    const cacheKey = `${profile.tenant_id}:${profile.rol}`
    if (cache.has(cacheKey)) {
      setPermisos(cache.get(cacheKey)!)
      setLoading(false)
      return
    }

    supabase
      .from('permisos_roles')
      .select('seccion, habilitado, orden')
      .eq('tenant_id', profile.tenant_id)
      .eq('rol', profile.rol)
      .then(({ data }) => {
        const map = new Map<string, PermisoData>()
        for (const row of (data ?? []) as { seccion: string; habilitado: boolean; orden: number }[]) {
          map.set(row.seccion, { habilitado: row.habilitado, orden: row.orden ?? 0 })
        }
        cache.set(cacheKey, map)
        setPermisos(map)
        setLoading(false)
      })
  }, [profile?.tenant_id, profile?.rol])

  // Si no hay fila en DB para esa sección, por defecto está habilitada
  const tienePermiso = (seccion: string): boolean => {
    if (!profile || profile.rol === 'control_total') return true
    if (loading) return true
    const val = permisos.get(seccion)
    return val === undefined ? true : val.habilitado
  }

  // Devuelve el orden almacenado, o el índice por defecto si no hay fila
  const getOrden = (seccion: string, defaultOrden: number): number => {
    const val = permisos.get(seccion)
    return !val || val.orden === 0 ? defaultOrden : val.orden
  }

  return { tienePermiso, getOrden, loading }
}
