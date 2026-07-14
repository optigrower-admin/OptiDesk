'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/ventas/pipeline'
import PagoTab from './PagoTab'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
  onProximaAccionChange?: (proxAccion: string | null, proxFecha: string | null) => void
}

type MotoCatalogo = { id: string; referencia: string; precio: number; costo_documentos: number; costo_prenda: number }
type Seleccion = { id: string; disponibilidad: 'inventario' | 'pedir'; motos_catalogo: MotoCatalogo | null }
type Recordatorio = { id: string; nota: string | null; fecha_recordatorio: string; completado: boolean }
type Paso = { id: string; descripcion: string; completado: boolean; orden: number }
type OrdenResumen = { id: string; numero: string | null; created_at: string; estado: string; descripcion_problema: string | null }

function formatDateHour(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ResumenTab({ clienteId, tenantId, usuarioId, onProximaAccionChange }: Props) {
  const supabase = createClient()
  const [seleccion, setSeleccion] = useState<Seleccion[]>([])
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [pasos, setPasos] = useState<Paso[]>([])
  const [ordenesST, setOrdenesST] = useState<OrdenResumen[]>([])
  const [ordenesRep, setOrdenesRep] = useState<OrdenResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmUncheckPasoId, setConfirmUncheckPasoId] = useState<string | null>(null)
  const [confirmUncheckRecId, setConfirmUncheckRecId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [{ data: sel }, { data: recs }, { data: pasosData }, { data: stData }, { data: repData }] = await Promise.all([
      supabase.from('clientes_motos_interes')
        .select('id, disponibilidad, motos_catalogo(id, referencia, precio, costo_documentos, costo_prenda)')
        .eq('cliente_id', clienteId),
      supabase.from('recordatorios')
        .select('id, nota, fecha_recordatorio, completado')
        .eq('cliente_id', clienteId)
        .order('fecha_recordatorio', { ascending: true }),
      supabase.from('clientes_pasos')
        .select('id, descripcion, completado, orden')
        .eq('cliente_id', clienteId)
        .order('orden'),
      supabase.from('ordenes')
        .select('id, numero, created_at, estado, descripcion_problema')
        .eq('cliente_id', clienteId)
        .eq('tipo_orden', 'servicio')
        .order('created_at', { ascending: false }),
      supabase.from('ordenes')
        .select('id, numero, created_at, estado, descripcion_problema')
        .eq('cliente_id', clienteId)
        .eq('tipo_orden', 'venta_repuestos')
        .order('created_at', { ascending: false }),
    ])
    setSeleccion((sel ?? []).map(s => ({
      ...s,
      motos_catalogo: Array.isArray(s.motos_catalogo) ? s.motos_catalogo[0] ?? null : s.motos_catalogo,
    })) as Seleccion[])
    setRecordatorios((recs ?? []) as Recordatorio[])
    setPasos((pasosData ?? []) as Paso[])
    setOrdenesST((stData ?? []) as OrdenResumen[])
    setOrdenesRep((repData ?? []) as OrdenResumen[])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  async function sincronizarProximaAccion() {
    const { data: prox } = await supabase.from('recordatorios')
      .select('nota, fecha_recordatorio')
      .eq('cliente_id', clienteId).eq('completado', false)
      .order('fecha_recordatorio', { ascending: true }).limit(1).maybeSingle()
    await supabase.from('clientes').update({
      proxima_accion:       prox?.nota ?? null,
      proxima_accion_fecha: prox?.fecha_recordatorio ?? null,
    }).eq('id', clienteId)
    onProximaAccionChange?.(prox?.nota ?? null, prox?.fecha_recordatorio ?? null)
  }

  async function toggleRecordatorio(r: Recordatorio) {
    if (r.completado) {
      setConfirmUncheckRecId(r.id)
      return
    }
    await supabase.from('recordatorios').update({ completado: true, completado_at: new Date().toISOString() }).eq('id', r.id)
    await sincronizarProximaAccion()
    cargar()
  }

  async function confirmarUncheckRec() {
    if (!confirmUncheckRecId) return
    await supabase.from('recordatorios').update({ completado: false, completado_at: null }).eq('id', confirmUncheckRecId)
    await sincronizarProximaAccion()
    setConfirmUncheckRecId(null)
    cargar()
  }

  async function togglePaso(p: Paso) {
    if (p.completado) {
      setConfirmUncheckPasoId(p.id)
      return
    }
    await supabase.from('clientes_pasos').update({
      completado: true,
      completado_por: usuarioId,
      completado_at: new Date().toISOString(),
    }).eq('id', p.id)
    cargar()
  }

  async function confirmarUncheckPaso() {
    if (!confirmUncheckPasoId) return
    await supabase.from('clientes_pasos').update({
      completado: false,
      completado_por: null,
      completado_at: null,
    }).eq('id', confirmUncheckPasoId)
    setConfirmUncheckPasoId(null)
    cargar()
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-4">
      {/* Motos de interés */}
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

      </div>

      {/* Pago */}
      <div className="border-t pt-3">
        <PagoTab clienteId={clienteId} tenantId={tenantId} usuarioId={usuarioId} />
      </div>

      {/* Pasos a seguir */}
      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pasos a seguir</p>
        {pasos.length === 0 && (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">
            Sin pasos definidos — agrégalos en la pestaña Pasos
          </p>
        )}
        <div className="space-y-1">
          {pasos.map(p => (
            <div key={p.id}>
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                confirmUncheckPasoId === p.id ? 'bg-red-50 border border-red-200 rounded-b-none' : 'bg-gray-50'
              }`}>
                <input type="checkbox" checked={p.completado} onChange={() => togglePaso(p)} className="flex-shrink-0" />
                <span className={`flex-1 text-sm ${p.completado ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {p.descripcion}
                </span>
              </div>
              {confirmUncheckPasoId === p.id && (
                <div className="bg-red-50 border border-red-200 border-t-0 rounded-b-lg px-3 py-2 text-xs text-red-700">
                  <p className="font-semibold mb-2">¿Estás seguro? Saldrá como si no se hubiera completado.</p>
                  <div className="flex gap-2">
                    <button onClick={confirmarUncheckPaso}
                      className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold">
                      Sí, desmarcar
                    </button>
                    <button onClick={() => setConfirmUncheckPasoId(null)}
                      className="flex-1 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-semibold">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recordatorios — todos (pendientes + completados) */}
      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recordatorios</p>
        {recordatorios.length === 0 && (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">
            Sin recordatorios — créalos en la pestaña Recordatorios
          </p>
        )}
        <div className="space-y-1.5">
          {recordatorios.map(r => {
            const vencido = !r.completado && new Date(r.fecha_recordatorio).getTime() < Date.now()
            return (
              <div key={r.id}>
                <div className={`border rounded-xl px-3 py-2 ${
                  confirmUncheckRecId === r.id
                    ? 'bg-red-50 border-red-200 rounded-b-none'
                    : r.completado
                      ? 'bg-green-50 border-green-200'
                      : vencido
                        ? 'bg-red-50 border-red-300'
                        : 'bg-blue-50 border-blue-200'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${
                        r.completado ? 'text-green-700' : vencido ? 'text-red-700' : 'text-blue-800'
                      }`}>
                        {r.completado ? '✓ ' : vencido ? '⏰ ' : '📌 '}{formatDateHour(r.fecha_recordatorio)}
                      </p>
                      {r.nota && <p className={`text-xs mt-0.5 ${
                        r.completado ? 'text-gray-600' : vencido ? 'text-red-700' : 'text-blue-700'
                      }`}>{r.nota}</p>}
                    </div>
                    <button
                      onClick={() => toggleRecordatorio(r)}
                      className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        r.completado
                          ? 'text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                      title={r.completado ? 'Desmarcar' : 'Marcar como hecho'}
                    >
                      {r.completado ? '↩' : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          Hecho
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {confirmUncheckRecId === r.id && (
                  <div className="bg-red-50 border border-red-200 border-t-0 rounded-b-xl px-3 py-2 text-xs text-red-700">
                    <p className="font-semibold mb-2">¿Estás seguro? Saldrá como si no se hubiera completado.</p>
                    <div className="flex gap-2">
                      <button onClick={confirmarUncheckRec}
                        className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold">
                        Sí, desmarcar
                      </button>
                      <button onClick={() => setConfirmUncheckRecId(null)}
                        className="flex-1 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-semibold">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Servicios técnicos realizados */}
      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Servicio técnico</p>
        {ordenesST.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">Sin órdenes de servicio técnico</p>
        ) : (
          <div className="space-y-1.5">
            {ordenesST.map(o => (
              <a key={o.id} href={`/admin/ordenes/${o.id}`}
                className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 hover:bg-blue-100 transition-colors group">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-blue-800">
                    {o.numero ? `#${o.numero}` : 'Sin número'} · {new Date(o.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  {o.descripcion_problema && (
                    <p className="text-xs text-blue-600 truncate mt-0.5">{o.descripcion_problema}</p>
                  )}
                </div>
                <span className="flex-shrink-0 text-blue-400 group-hover:text-blue-600 ml-2 text-xs">→</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Repuestos comprados */}
      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Repuestos comprados</p>
        {ordenesRep.length === 0 ? (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">Sin compras de repuestos</p>
        ) : (
          <div className="space-y-1.5">
            {ordenesRep.map(o => (
              <a key={o.id} href={`/admin/repuestos/nueva-venta?ordenId=${o.id}`}
                className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 hover:bg-amber-100 transition-colors group">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-800">
                    {o.numero ? `#${o.numero}` : 'Sin número'} · {new Date(o.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">{o.estado}</p>
                </div>
                <span className="flex-shrink-0 text-amber-400 group-hover:text-amber-600 ml-2 text-xs">→</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
