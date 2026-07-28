'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, calcularPrecioMoto } from '@/lib/ventas/pipeline'
import PagoTab from './PagoTab'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
  onProximaAccionChange?: (proxAccion: string | null, proxFecha: string | null) => void
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

type Recordatorio = { id: string; nota: string | null; fecha_recordatorio: string; completado: boolean }
type Paso = { id: string; descripcion: string; completado: boolean; orden: number }

function formatDateHour(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function PasoItem({ p, onToggle, confirmId, onConfirm, onCancelConfirm }: {
  p: Paso
  onToggle: (p: Paso) => void
  confirmId: string | null
  onConfirm: () => void
  onCancelConfirm: () => void
}) {
  const isConfirm = confirmId === p.id
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 ${isConfirm ? 'bg-red-50 border-red-200' : p.completado ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
        <input type="checkbox" checked={p.completado} onChange={() => onToggle(p)} className="flex-shrink-0" />
        <span className={`flex-1 text-sm ${p.completado ? 'line-through text-gray-400' : 'text-gray-800'}`}>{p.descripcion}</span>
      </div>
      {isConfirm && (
        <div className="bg-red-50 border-t border-red-200 px-3 py-2 text-xs text-red-700">
          <p className="font-semibold mb-2">¿Estás seguro? Saldrá como si no se hubiera completado.</p>
          <div className="flex gap-2">
            <button onClick={onConfirm} className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold">Sí, desmarcar</button>
            <button onClick={onCancelConfirm} className="flex-1 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-semibold">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function RecordatorioItem({ r, onToggle, confirmId, onConfirm, onCancelConfirm }: {
  r: Recordatorio
  onToggle: (r: Recordatorio) => void
  confirmId: string | null
  onConfirm: () => void
  onCancelConfirm: () => void
}) {
  const vencido   = !r.completado && new Date(r.fecha_recordatorio).getTime() < Date.now()
  const isConfirm = confirmId === r.id
  const bg = isConfirm ? 'bg-red-50 border-red-200'
    : r.completado ? 'bg-green-50 border-green-200'
    : vencido ? 'bg-red-50 border-red-300'
    : 'bg-blue-50 border-blue-200'
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className={`flex items-start gap-2 px-3 py-2 ${bg}`}>
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-bold mb-0.5 ${r.completado ? 'text-green-600' : vencido ? 'text-red-600' : 'text-blue-600'}`}>
            {r.completado ? '✓ ' : vencido ? '⏰ ' : '📌 '}{formatDateHour(r.fecha_recordatorio)}
          </p>
          {r.nota && <p className={`text-sm ${r.completado ? 'line-through text-gray-400' : vencido ? 'text-red-800' : 'text-gray-800'}`}>{r.nota}</p>}
        </div>
        <button onClick={() => onToggle(r)}
          className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
            r.completado ? 'text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300'
            : 'bg-green-600 hover:bg-green-700 text-white'
          }`}>
          {r.completado ? '↩' : (<><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>Hecho</>)}
        </button>
      </div>
      {isConfirm && (
        <div className="bg-red-50 border-t border-red-200 px-3 py-2 text-xs text-red-700">
          <p className="font-semibold mb-2">¿Estás seguro? Saldrá como si no se hubiera completado.</p>
          <div className="flex gap-2">
            <button onClick={onConfirm} className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold">Sí, desmarcar</button>
            <button onClick={onCancelConfirm} className="flex-1 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-100 rounded-lg text-xs font-semibold">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ResumenTab({ clienteId, tenantId, usuarioId, onProximaAccionChange, onCreditoChange }: Props) {
  const supabase = createClient()
  const [seleccion, setSeleccion] = useState<Seleccion[]>([])
  const [recargo, setRecargo]     = useState(5)
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([])
  const [pasos, setPasos] = useState<Paso[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmUncheckPasoId, setConfirmUncheckPasoId] = useState<string | null>(null)
  const [confirmUncheckRecId, setConfirmUncheckRecId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [{ data: sel }, { data: recs }, { data: pasosData }, { data: tenant }] = await Promise.all([
      supabase.from('clientes_motos_interes')
        .select('id, disponibilidad, con_papeles, con_tarjeta, pignorada, motos_catalogo(id, referencia, precio, costo_documentos, costo_prenda)')
        .eq('cliente_id', clienteId),
      supabase.from('recordatorios')
        .select('id, nota, fecha_recordatorio, completado')
        .eq('cliente_id', clienteId)
        .order('fecha_recordatorio', { ascending: true }),
      supabase.from('clientes_pasos')
        .select('id, descripcion, completado, orden')
        .eq('cliente_id', clienteId)
        .order('orden'),
      supabase.from('tenants').select('recargo_tarjeta_porcentaje').eq('id', tenantId).single(),
    ])
    setSeleccion((sel ?? []).map(s => ({
      ...s,
      motos_catalogo: Array.isArray(s.motos_catalogo) ? s.motos_catalogo[0] ?? null : s.motos_catalogo,
    })) as Seleccion[])
    setRecargo(Number(tenant?.recargo_tarjeta_porcentaje ?? 5))
    setRecordatorios((recs ?? []) as Recordatorio[])
    setPasos((pasosData ?? []) as Paso[])
    setLoading(false)
  }, [clienteId, tenantId])

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

      {/* Pasos a seguir (unificado: pasos + recordatorios) */}
      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pasos a seguir</p>
        {pasos.length === 0 && recordatorios.length === 0 && (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">
            Sin pasos — agrégalos en la pestaña Pasos
          </p>
        )}
        <div className="space-y-1.5">
          {/* Recordatorios vencidos primero */}
          {recordatorios.filter(r => !r.completado && new Date(r.fecha_recordatorio).getTime() < Date.now()).map(r => (
            <RecordatorioItem key={r.id} r={r} onToggle={toggleRecordatorio} confirmId={confirmUncheckRecId} onConfirm={confirmarUncheckRec} onCancelConfirm={() => setConfirmUncheckRecId(null)} />
          ))}
          {/* Recordatorios futuros */}
          {recordatorios.filter(r => !r.completado && new Date(r.fecha_recordatorio).getTime() >= Date.now()).map(r => (
            <RecordatorioItem key={r.id} r={r} onToggle={toggleRecordatorio} confirmId={confirmUncheckRecId} onConfirm={confirmarUncheckRec} onCancelConfirm={() => setConfirmUncheckRecId(null)} />
          ))}
          {/* Pasos sin fecha */}
          {pasos.filter(p => !p.completado).map(p => (
            <PasoItem key={p.id} p={p} onToggle={togglePaso} confirmId={confirmUncheckPasoId} onConfirm={confirmarUncheckPaso} onCancelConfirm={() => setConfirmUncheckPasoId(null)} />
          ))}
          {/* Completados */}
          {recordatorios.filter(r => r.completado).map(r => (
            <RecordatorioItem key={r.id} r={r} onToggle={toggleRecordatorio} confirmId={confirmUncheckRecId} onConfirm={confirmarUncheckRec} onCancelConfirm={() => setConfirmUncheckRecId(null)} />
          ))}
          {pasos.filter(p => p.completado).map(p => (
            <PasoItem key={p.id} p={p} onToggle={togglePaso} confirmId={confirmUncheckPasoId} onConfirm={confirmarUncheckPaso} onCancelConfirm={() => setConfirmUncheckPasoId(null)} />
          ))}
        </div>
      </div>

    </div>
  )
}
