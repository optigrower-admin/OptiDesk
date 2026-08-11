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

function PasoItem({ p, onToggle, onEliminar, confirmId, onConfirm, onCancelConfirm, reprogId, reprogFecha, onReprogFecha, onAbrirReprog, onGuardarReprog }: {
  p: Paso
  onToggle: (p: Paso) => void
  onEliminar: (p: Paso) => void
  confirmId: string | null
  onConfirm: () => void
  onCancelConfirm: () => void
  reprogId: string | null
  reprogFecha: string
  onReprogFecha: (v: string) => void
  onAbrirReprog: (id: string, fechaActual: string) => void
  onGuardarReprog: () => void
}) {
  const isConfirm = confirmId === p.id
  const isReprog  = reprogId === p.id
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className={`px-3 py-2 ${isConfirm ? 'bg-red-50 border-red-200' : p.completado ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
        <div className="flex items-start justify-between gap-2">
          <span className={`text-sm ${p.completado ? 'line-through text-gray-400' : 'text-gray-800'}`}>{p.descripcion}</span>
          {!isConfirm && (
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => onToggle(p)} title={p.completado ? 'Desmarcar' : 'Marcar completado'}
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors ${
                  p.completado ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                ✓
              </button>
              <button onClick={() => onAbrirReprog(p.id, '')} title="Reprogramar"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-sm bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
                📅
              </button>
              <button onClick={() => onEliminar(p)} title="Eliminar"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-sm text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
      {isReprog && (
        <div className="bg-amber-50 border-t border-amber-200 px-3 py-2 space-y-1.5">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Nueva fecha y hora</p>
          <input type="datetime-local" value={reprogFecha} onChange={e => onReprogFecha(e.target.value)}
            className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <button onClick={onGuardarReprog} disabled={!reprogFecha}
            className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-colors">
            Guardar
          </button>
        </div>
      )}
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

function RecordatorioItem({ r, onToggle, onDuplicar, onEliminar, confirmId, onConfirm, onCancelConfirm, reprogId, reprogFecha, onReprogFecha, onAbrirReprog, onGuardarReprog }: {
  r: Recordatorio
  onToggle: (r: Recordatorio) => void
  onDuplicar: (r: Recordatorio) => void
  onEliminar: (r: Recordatorio) => void
  confirmId: string | null
  onConfirm: () => void
  onCancelConfirm: () => void
  reprogId: string | null
  reprogFecha: string
  onReprogFecha: (v: string) => void
  onAbrirReprog: (id: string, fechaActual: string) => void
  onGuardarReprog: () => void
}) {
  const vencido   = !r.completado && new Date(r.fecha_recordatorio).getTime() < Date.now()
  const isConfirm = confirmId === r.id
  const isReprog  = reprogId === r.id
  const bg = isConfirm ? 'bg-red-50 border-red-200'
    : r.completado ? 'bg-green-50 border-green-200'
    : vencido ? 'bg-red-50 border-red-300'
    : 'bg-blue-50 border-blue-200'
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className={`px-3 py-2 ${bg}`}>
        <p className={`text-[10px] font-bold mb-0.5 ${r.completado ? 'text-green-600' : vencido ? 'text-red-600' : 'text-blue-600'}`}>
          {r.completado ? '✓ ' : vencido ? '⏰ ' : '📌 '}{formatDateHour(r.fecha_recordatorio)}
        </p>
        <div className="flex items-start justify-between gap-2">
          {r.nota && <p className={`text-sm ${r.completado ? 'line-through text-gray-400' : vencido ? 'text-red-800' : 'text-gray-800'}`}>{r.nota}</p>}
          {!isConfirm && (
            <div className="flex gap-1 flex-shrink-0 ml-auto">
              <button onClick={() => onToggle(r)} title={r.completado ? 'Desmarcar' : 'Marcar completado'}
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-colors ${
                  r.completado ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                ✓
              </button>
              <button onClick={() => onDuplicar(r)} title="Duplicar"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                🔁
              </button>
              <button onClick={() => onAbrirReprog(r.id, r.fecha_recordatorio.slice(0, 16))} title="Reprogramar"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-sm bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
                📅
              </button>
              <button onClick={() => onEliminar(r)} title="Eliminar"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-sm text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
      {isReprog && (
        <div className="bg-amber-50 border-t border-amber-200 px-3 py-2 space-y-1.5">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Nueva fecha y hora</p>
          <input type="datetime-local" value={reprogFecha} onChange={e => onReprogFecha(e.target.value)}
            className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <button onClick={onGuardarReprog} disabled={!reprogFecha}
            className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-colors">
            Guardar
          </button>
        </div>
      )}
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
  const [reprogramarId, setReprogramarId] = useState<string | null>(null)
  const [reprogramarFecha, setReprogramarFecha] = useState('')

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

  async function eliminarRecordatorio(r: Recordatorio) {
    await supabase.from('recordatorios').delete().eq('id', r.id)
    await sincronizarProximaAccion()
    cargar()
  }

  async function eliminarPaso(p: Paso) {
    await supabase.from('clientes_pasos').delete().eq('id', p.id)
    cargar()
  }

  async function duplicarRecordatorio(r: Recordatorio) {
    const nuevaFecha = new Date(new Date(r.fecha_recordatorio).getTime() + 24 * 60 * 60 * 1000)
    await supabase.from('recordatorios').insert({
      cliente_id: clienteId, tenant_id: tenantId, asignado_a: usuarioId,
      nota: r.nota, fecha_recordatorio: nuevaFecha.toISOString(),
      completado: false, tipo: 'manual', enviar_email: false,
    })
    await sincronizarProximaAccion()
    cargar()
  }

  function abrirReprogramar(id: string, fechaActual: string) {
    if (reprogramarId === id) { setReprogramarId(null); setReprogramarFecha(''); return }
    setReprogramarId(id)
    setReprogramarFecha(fechaActual)
  }

  async function guardarReprogramarRec(r: Recordatorio) {
    if (!reprogramarFecha) return
    await supabase.from('recordatorios').update({ fecha_recordatorio: new Date(reprogramarFecha).toISOString() }).eq('id', r.id)
    await sincronizarProximaAccion()
    setReprogramarId(null); setReprogramarFecha('')
    cargar()
  }

  async function guardarReprogramarPaso(p: Paso) {
    if (!reprogramarFecha) return
    // Paso legado sin fecha: se convierte en acción con fecha y se retira el paso original.
    await supabase.from('recordatorios').insert({
      cliente_id: clienteId, tenant_id: tenantId, asignado_a: usuarioId,
      nota: p.descripcion, fecha_recordatorio: new Date(reprogramarFecha).toISOString(),
      completado: false, tipo: 'manual', enviar_email: false,
    })
    await supabase.from('clientes_pasos').delete().eq('id', p.id)
    await sincronizarProximaAccion()
    setReprogramarId(null); setReprogramarFecha('')
    cargar()
  }

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

      {/* Próximas Acciones (unificado: pasos legados + recordatorios) */}
      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Próximas Acciones</p>
        {pasos.length === 0 && recordatorios.length === 0 && (
          <p className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-3 text-center">
            Sin acciones — agrégalas en la pestaña Acciones
          </p>
        )}
        <div className="space-y-1.5">
          {/* Recordatorios vencidos primero */}
          {recordatorios.filter(r => !r.completado && new Date(r.fecha_recordatorio).getTime() < Date.now()).map(r => (
            <RecordatorioItem key={r.id} r={r} onToggle={toggleRecordatorio} onDuplicar={duplicarRecordatorio} onEliminar={eliminarRecordatorio}
              confirmId={confirmUncheckRecId} onConfirm={confirmarUncheckRec} onCancelConfirm={() => setConfirmUncheckRecId(null)}
              reprogId={reprogramarId} reprogFecha={reprogramarFecha} onReprogFecha={setReprogramarFecha}
              onAbrirReprog={abrirReprogramar} onGuardarReprog={() => guardarReprogramarRec(r)} />
          ))}
          {/* Recordatorios futuros */}
          {recordatorios.filter(r => !r.completado && new Date(r.fecha_recordatorio).getTime() >= Date.now()).map(r => (
            <RecordatorioItem key={r.id} r={r} onToggle={toggleRecordatorio} onDuplicar={duplicarRecordatorio} onEliminar={eliminarRecordatorio}
              confirmId={confirmUncheckRecId} onConfirm={confirmarUncheckRec} onCancelConfirm={() => setConfirmUncheckRecId(null)}
              reprogId={reprogramarId} reprogFecha={reprogramarFecha} onReprogFecha={setReprogramarFecha}
              onAbrirReprog={abrirReprogramar} onGuardarReprog={() => guardarReprogramarRec(r)} />
          ))}
          {/* Pasos legados sin fecha */}
          {pasos.filter(p => !p.completado).map(p => (
            <PasoItem key={p.id} p={p} onToggle={togglePaso} onEliminar={eliminarPaso} confirmId={confirmUncheckPasoId} onConfirm={confirmarUncheckPaso} onCancelConfirm={() => setConfirmUncheckPasoId(null)}
              reprogId={reprogramarId} reprogFecha={reprogramarFecha} onReprogFecha={setReprogramarFecha}
              onAbrirReprog={abrirReprogramar} onGuardarReprog={() => guardarReprogramarPaso(p)} />
          ))}
          {/* Completadas */}
          {recordatorios.filter(r => r.completado).map(r => (
            <RecordatorioItem key={r.id} r={r} onToggle={toggleRecordatorio} onDuplicar={duplicarRecordatorio} onEliminar={eliminarRecordatorio}
              confirmId={confirmUncheckRecId} onConfirm={confirmarUncheckRec} onCancelConfirm={() => setConfirmUncheckRecId(null)}
              reprogId={reprogramarId} reprogFecha={reprogramarFecha} onReprogFecha={setReprogramarFecha}
              onAbrirReprog={abrirReprogramar} onGuardarReprog={() => guardarReprogramarRec(r)} />
          ))}
          {pasos.filter(p => p.completado).map(p => (
            <PasoItem key={p.id} p={p} onToggle={togglePaso} onEliminar={eliminarPaso} confirmId={confirmUncheckPasoId} onConfirm={confirmarUncheckPaso} onCancelConfirm={() => setConfirmUncheckPasoId(null)}
              reprogId={reprogramarId} reprogFecha={reprogramarFecha} onReprogFecha={setReprogramarFecha}
              onAbrirReprog={abrirReprogramar} onGuardarReprog={() => guardarReprogramarPaso(p)} />
          ))}
        </div>
      </div>

    </div>
  )
}
