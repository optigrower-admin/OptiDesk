'use client'
export const dynamic = 'force-dynamic'

import { useAuth } from '@/hooks/useAuth'
import ActividadesClient from './ActividadesClient'

export default function ActividadesPage() {
  const { profile } = useAuth()
  if (!profile?.tenant_id) return null
  return <ActividadesClient tenantId={profile.tenant_id} usuarioId={profile.id} rol={profile.rol} />
}
