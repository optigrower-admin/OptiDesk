'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'

interface AuditEntry {
  id: string
  tipo: 'movimiento' | 'edicion' | 'eliminacion'
  tabla: string
  descripcion: string | null
  created_at: string
  usuarios: { nombre: string } | null
  valor_anterior?: Record<string, unknown> | null
  valor_nuevo?: Record<string, unknown> | null
}

const tipoConfig = {
  movimiento: { label: 'Movimiento', variant: 'blue' as const },
  edicion:    { label: 'Edición',    variant: 'amber' as const },
  eliminacion:{ label: 'Eliminación',variant: 'red' as const },
}

// Campos que no aportan información útil en el diff
const CAMPOS_IGNORADOS = new Set([
  'updated_at', 'created_at', 'tenant_id', 'id',
  'moto_id', 'cliente_id', 'mecanico_id',
])

const ETIQUETAS: Record<string, string> = {
  cliente:                 'Cliente',
  placa:                   'Placa',
  descripcion:             'Descripción',
  estado:                  'Estado',
  estado_pago:             'Estado de pago',
  valor_total:             'Total',
  valor_abono:             'Abono',
  motivo_pendiente:        'Motivo pendiente',
  numero:                  'Número',
  categoria_servicio_id:   'Categoría (ID)',
  subcategoria_servicio_id:'Subcategoría (ID)',
  metodo_pago_id:          'Método de pago (ID)',
  descripcion_item:        'Descripción ítem',
  cantidad:                'Cantidad',
  precio_venta:            'Precio venta',
  costo:                   'Costo',
  origen:                  'Origen',
  nombre_archivo:          'Archivo',
  tipo:                    'Tipo',
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'number') return String(v)
  return String(v)
}

function DiffView({ anterior, nuevo }: { anterior: Record<string, unknown> | null | undefined, nuevo: Record<string, unknown> | null | undefined }) {
  if (!anterior && !nuevo) return null

  if (!nuevo) {
    // Eliminación — mostrar valores relevantes del registro eliminado
    const campos = Object.entries(anterior ?? {}).filter(([k]) => !CAMPOS_IGNORADOS.has(k) && anterior![k] != null && anterior![k] !== '')
    if (!campos.length) return null
    return (
      <div className="mt-2 space-y-1">
        {campos.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <span className="text-gray-400 w-32 flex-shrink-0">{ETIQUETAS[k] ?? k}</span>
            <span className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded line-through">{formatVal(v)}</span>
          </div>
        ))}
      </div>
    )
  }

  // Edición — mostrar solo campos que cambiaron
  const cambios = Object.keys({ ...anterior, ...nuevo }).filter((k) => {
    if (CAMPOS_IGNORADOS.has(k)) return false
    const a = JSON.stringify((anterior ?? {})[k])
    const n = JSON.stringify((nuevo ?? {})[k])
    return a !== n
  })

  if (!cambios.length) return <p className="text-xs text-gray-400 mt-1 italic">Sin cambios detectados en campos relevantes</p>

  return (
    <div className="mt-2 space-y-1.5">
      {cambios.map((k) => (
        <div key={k} className="flex flex-wrap gap-1 text-xs items-center">
          <span className="text-gray-400 w-32 flex-shrink-0">{ETIQUETAS[k] ?? k}</span>
          <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded line-through">{formatVal((anterior ?? {})[k])}</span>
          <span className="text-gray-400">→</span>
          <span className="bg-green-50 text-green-700 px-1.5 py-0.5 rounded">{formatVal((nuevo ?? {})[k])}</span>
        </div>
      ))}
    </div>
  )
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [abierto, setAbierto] = useState(false)
  const cfg = tipoConfig[entry.tipo]
  const tieneDetalle = entry.valor_anterior != null || entry.valor_nuevo != null

  return (
    <>
      <tr
        className={`border-b transition-colors ${tieneDetalle ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        onClick={() => tieneDetalle && setAbierto((p) => !p)}
      >
        <td className="py-3 px-4 text-gray-600 whitespace-nowrap text-xs">
          {new Date(entry.created_at).toLocaleString('es-CO')}
        </td>
        <td className="py-3 px-4">
          <Badge variant={cfg.variant}>{cfg.label}</Badge>
        </td>
        <td className="py-3 px-4 text-gray-600 capitalize text-sm">{entry.tabla}</td>
        <td className="py-3 px-4 text-gray-800 text-sm">{entry.descripcion ?? '—'}</td>
        <td className="py-3 px-4 text-gray-600 text-sm">{entry.usuarios?.nombre ?? '—'}</td>
        <td className="py-3 px-4">
          {tieneDetalle && (
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </td>
      </tr>
      {abierto && tieneDetalle && (
        <tr className="border-b bg-gray-50">
          <td colSpan={6} className="px-4 pb-3 pt-1">
            <DiffView anterior={entry.valor_anterior} nuevo={entry.valor_nuevo} />
          </td>
        </tr>
      )}
    </>
  )
}

export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) {
    return <p className="text-sm text-gray-500 text-center py-8">Sin registros de auditoría</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 uppercase border-b">
            <th className="text-left py-3 px-4 font-medium">Fecha/Hora</th>
            <th className="text-left py-3 px-4 font-medium">Tipo</th>
            <th className="text-left py-3 px-4 font-medium">Tabla</th>
            <th className="text-left py-3 px-4 font-medium">Descripción</th>
            <th className="text-left py-3 px-4 font-medium">Usuario</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => <AuditRow key={entry.id} entry={entry} />)}
        </tbody>
      </table>
    </div>
  )
}
