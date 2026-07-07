'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/ventas/pipeline'
import ComentariosTab from './ComentariosTab'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
  onProximaAccionChange?: (proxAccion: string | null, proxFecha: string | null) => void
}

type MotoCatalogo = { id: string; referencia: string; precio: number; costo_documentos: number; costo_prenda: number }
type Seleccion = { id: string; disponibilidad: 'inventario' | 'pedir'; motos_catalogo: MotoCatalogo | null }
type Recordatorio = { id: string; nota: string | null; fecha_recordatorio: string }

function formatDateHour(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ResumenTab({ clienteId, tenantId, usuarioId, onProximaAccionChange }: Props) {
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

  async function completarRecordatorio(id: string) {
    await supabase.from('recordatorios').update({
      completado: true,
      completado_at: new Date().toISOString(),
    }).eq('id', id)
    // Siguiente recordatorio pendiente → actualizar proxima_accion en clientes
    const { data: prox } = await supabase.from('recordatorios')
      .select('nota, fecha_recordatorio')
      .eq('cliente_id', clienteId).eq('completado', false)
      .order('fecha_recordatorio', { ascending: true }).limit(1).maybeSingle()
    await supabase.from('clientes').update({
      proxima_accion:       prox?.nota ?? null,
      proxima_accion_fecha: prox?.fecha_recordatorio ?? null,
    }).eq('id', clienteId)
    onProximaAccionChange?.(prox?.nota ?? null, prox?.fecha_recordatorio ?? null)
    cargar()
  }

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
        {recordatorios.map(r => {
          const vencido = new Date(r.fecha_recordatorio).getTime() < Date.now()
          return (
            <div key={r.id} className={`border rounded-xl px-3 py-2 mb-1.5 ${vencido ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${vencido ? 'text-red-700' : 'text-blue-800'}`}>
                    {vencido ? '⏰ ' : '📌 '}{formatDateHour(r.fecha_recordatorio)}
                  </p>
                  {r.nota && <p className={`text-xs mt-0.5 ${vencido ? 'text-red-700' : 'text-blue-700'}`}>{r.nota}</p>}
                </div>
                <button
                  onClick={() => completarRecordatorio(r.id)}
                  className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors"
                  title="Marcar como hecho"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                  Hecho
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
