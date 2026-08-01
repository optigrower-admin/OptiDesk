'use client'
export const dynamic = 'force-dynamic'
import UsoEquipoTab from '../equipo/components/UsoEquipoTab'

export default function MiUsoPage() {
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mi Uso</h1>
        <p className="text-sm text-gray-500">Tu actividad dentro de OptiDesk — tiempo activo, acciones y almacenamiento.</p>
      </div>
      <UsoEquipoTab />
    </div>
  )
}
