'use client'
export const dynamic = 'force-dynamic'
import { useRouter } from 'next/navigation'
import NuevoClienteForm from '../../ventas/components/NuevoClienteForm'

export default function AdminMovilProspecto() {
  const router = useRouter()

  return (
    <NuevoClienteForm
      variant="pantalla"
      onClose={() => router.push('/admin/movil')}
      onCreated={() => router.push('/admin/movil')}
    />
  )
}
