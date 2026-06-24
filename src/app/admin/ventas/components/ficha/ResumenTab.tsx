'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/ventas/pipeline'
import ComentariosTab from './ComentariosTab'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
}

type MotoCatalogo = { id: string; referencia: string; precio: number; costo_documentos: number; costo_prenda: number }
type Seleccion = { id: string; disponibilidad: 'inventario' | 'pedir'; motos_catalogo: MotoCatalogo | null }
type Recordatorio = { id: string; nota: string | null; fecha_recordatorio: string }

function formatDateHour(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ResumenTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()
  const [seleccion, setSeleccion] = useState<Seleccion[]>([])
  const [formaPago, setFormaPago] = useState<'contado' | 'credito' | ''>('')
  const [cuotaInicialSi, setCuotaInicialSi] = useState(false)
  const [cuotaInicial, setCuotaInicial] = useState<number | null>(null)
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const [{ data: sel }, { data: cliente }, { data: recs }] = await Promise.all([
      supabase.from('clientes_motos_interes')
        .select('id, disponibilidad, motos_catalogo(id, referencia, precio, costo_documentos, costo_prenda)')
        .eq('cliente_id', clienteId),
      supabase.from('clientes')
        .select('forma_pago, credito_tiene_cuota_inicial, cuota_inicial')
        .eq('id', clienteId).single(),
      supabase.from('recordatorios')
        .select('id, nota, fecha_recordatorio')
        .eq('cliente_id', clienteId).eq('completado', false)
        .order('fecha_recordatorio', { ascending: true }),
    ])
    setSeleccion((sel ?? []).map(s => ({
      ...s,
      motos_catalogo: Array.isArray(s.motos_catalogo) ? s.motos_catalogo[0] ?? null : s.motos_catalogo,
    })) as Seleccion[])
    setFormaPago((cliente?.forma_pago ?? '') as 'contado' | 'credito' | '')
    setCuotaInicialSi(!!cliente?.credito_tiene_cuota_inicial)
    setCuotaInicial(cliente?.cuota_inicial ?? null)
    setRecordatorios((recs ?? []) as Recordatorio[])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Motos de interés</p>
        {seleccion.length === 0 && (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">
            Sin motos seleccionadas — agrégalas en la pestaña Motos
          </p>
        )}
        {seleccion.map(s => {
          const m = s.motos_catalogo
          const precioConDocs = (m?.precio ?? 0) + (m?.costo_documentos ?? 0)
          return (
            <div key={s.id} className="border border-gray-200 rounded-xl p-2.5 mb-1.5">
              <p className="font-semibold text-sm text-gray-900">{m?.referencia ?? 'Moto eliminada del catálogo'}</p>
              {m && (
                <p className="text-xs text-emerald-700 font-semibold">
                  {formatCOP(precioConDocs)} con documentos
                </p>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block mt-1 ${
                s.disponibilidad === 'inventario' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {s.disponibilidad === 'inventario' ? 'En inventario' : 'Hay que pedirla'}
              </span>
            </div>
          )
        })}

        <div className="bg-gray-50 rounded-lg px-3 py-2 mt-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Forma de pago</p>
          {!formaPago && <p className="text-sm text-gray-500">No sabe todavía</p>}
          {formaPago === 'contado' && <p className="text-sm text-gray-800">Contado</p>}
          {formaPago === 'credito' && (
            <p className="text-sm text-gray-800">
              Crédito{cuotaInicialSi
                ? ` — con cuota inicial${cuotaInicial ? ` de ${formatCOP(cuotaInicial)}` : ''}`
                : ' — sin cuota inicial'}
            </p>
          )}
        </div>
      </div>

      <div className="border-t pt-3">
        <ComentariosTab clienteId={clienteId} tenantId={tenantId} usuarioId={usuarioId} />
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Próximas acciones</p>
        {recordatorios.length === 0 && (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">
            Sin próximas acciones — créalas en la pestaña Recordatorios
          </p>
        )}
        {recordatorios.map(r => (
          <div key={r.id} className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-1.5">
            <p className="text-xs font-semibold text-blue-800">{formatDateHour(r.fecha_recordatorio)}</p>
            {r.nota && <p className="text-xs text-blue-700 mt-0.5">{r.nota}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
