'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, calcularPrecioMoto } from '@/lib/ventas/pipeline'
import PagoTab from './PagoTab'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
  onCreditoChange?: (aprobada: string | null, rechazadas: string[]) => void
}

type MotoCatalogo = { id: string; referencia: string; precio: number; costo_documentos: number; costo_prenda: number }
type Seleccion = {
  id: string
  disponibilidad: 'inventario' | 'pedir'
  con_papeles: boolean
  con_tarjeta: boolean
  pignorada: boolean
  motos_catalogo: MotoCatalogo | null
}

export default function ResumenTab({ clienteId, tenantId, usuarioId, onCreditoChange }: Props) {
  const supabase = createClient()
  const [seleccion, setSeleccion] = useState<Seleccion[]>([])
  const [recargo, setRecargo]     = useState(5)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const [{ data: sel }, { data: tenant }] = await Promise.all([
      supabase.from('clientes_motos_interes')
        .select('id, disponibilidad, con_papeles, con_tarjeta, pignorada, motos_catalogo(id, referencia, precio, costo_documentos, costo_prenda)')
        .eq('cliente_id', clienteId),
      supabase.from('tenants').select('recargo_tarjeta_porcentaje').eq('id', tenantId).single(),
    ])
    setSeleccion((sel ?? []).map(s => ({
      ...s,
      motos_catalogo: Array.isArray(s.motos_catalogo) ? s.motos_catalogo[0] ?? null : s.motos_catalogo,
    })) as Seleccion[])
    setRecargo(Number(tenant?.recargo_tarjeta_porcentaje ?? 5))
    setLoading(false)
  }, [clienteId, tenantId])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-4">
      {/* Vehículos de interés */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Vehículos de interés</p>
        {seleccion.length === 0 && (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">
            Sin vehículos seleccionados — agrégalos en la pestaña Vehículos
          </p>
        )}
        {seleccion.map(s => {
          const m = s.motos_catalogo
          const precio = m ? calcularPrecioMoto(m, s.con_papeles, s.con_tarjeta, s.pignorada, recargo) : 0
          return (
            <div key={s.id} className="border border-gray-200 rounded-xl p-2.5 mb-1.5">
              <p className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
                {s.disponibilidad === 'pedir' && <span title="Hay que pedirla">🚚</span>}
                {m?.referencia ?? 'Moto eliminada del catálogo'}
              </p>
              {m && (
                <p className="text-sm text-emerald-700 font-bold">{formatCOP(precio)}</p>
              )}
              <div className="flex flex-wrap items-center gap-1 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  s.disponibilidad === 'inventario' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {s.disponibilidad === 'inventario' ? '✅ En inventario' : '🚚 Hay que pedirla'}
                </span>
                <span className="text-[11px] text-gray-400">
                  {s.pignorada ? 'Pignorada' : s.con_papeles ? 'Con papeles' : 'Sin papeles'} · {s.con_tarjeta ? 'con tarjeta' : 'sin tarjeta'}
                </span>
              </div>
            </div>
          )
        })}

      </div>

      {/* Pago */}
      <div className="border-t pt-3">
        <PagoTab clienteId={clienteId} tenantId={tenantId} usuarioId={usuarioId} onCreditoChange={onCreditoChange} />
      </div>

    </div>
  )
}
