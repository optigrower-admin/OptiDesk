'use client'
export const dynamic = 'force-dynamic'
import UsoEquipoTab from '../../admin/equipo/components/UsoEquipoTab'

export default function MecanicoUsoPage() {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Mi Uso</h1>
        <p className="text-xs text-gray-500">Tu actividad dentro de OptiDesk.</p>
      </div>
      <UsoEquipoTab />
    </div>
  )
}
