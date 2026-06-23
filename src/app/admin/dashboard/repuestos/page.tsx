'use client'
export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function DashboardRepuestosPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && profile && !['gerencia', 'dueno'].includes(profile.rol)) {
      router.replace('/admin/ordenes')
    }
  }, [loading, profile, router])

  if (loading || !profile) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!['gerencia', 'dueno'].includes(profile.rol)) return null

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard Repuestos</h1>
      <p className="text-gray-500">Próximamente: KPIs de ventas directas de repuestos, inventario y rankings.</p>
    </div>
  )
}
