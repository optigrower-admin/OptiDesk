'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  clienteId: string
  tenantId: string
  usuarioId: string
}

type Paso = { id: string; descripcion: string; completado: boolean; orden: number }

export default function PasosTab({ clienteId, tenantId, usuarioId }: Props) {
  const supabase = createClient()
  const [pasos, setPasos]       = useState<Paso[]>([])
  const [nuevo, setNuevo]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [confirmUncheckId, setConfirmUncheckId] = useState<string | null>(null)

  // Per-step recordatorio toggle UI state (keyed by paso id)
  const [recAbierto, setRecAbierto]     = useState<string | null>(null)
  const [recFecha, setRecFecha]         = useState('')
  const [recEmail, setRecEmail]         = useState(false)
  const [savingRec, setSavingRec]       = useState(false)

  // New paso form recordatorio
  const [nuevoConRec, setNuevoConRec]   = useState(false)
  const [nuevoRecFecha, setNuevoRecFecha] = useState('')
  const [nuevoRecEmail, setNuevoRecEmail] = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('clientes_pasos')
      .select('id, descripcion, completado, orden').eq('cliente_id', clienteId).order('orden')
    setPasos((data ?? []) as Paso[])
    setLoading(false)
  }, [clienteId])

  useEffect(() => { cargar() }, [cargar])

  async function agregar() {
    const d = nuevo.trim()
    if (!d) return
    const { data: creado } = await supabase.from('clientes_pasos').insert({
      cliente_id: clienteId, tenant_id: tenantId, descripcion: d,
      orden: pasos.length, created_by: usuarioId,
    }).select('id').single()

    if (nuevoConRec && nuevoRecFecha && creado?.id) {
      await supabase.from('recordatorios').insert({
        cliente_id: clienteId, tenant_id: tenantId, asignado_a: usuarioId,
        nota: d, fecha_recordatorio: new Date(nuevoRecFecha).toISOString(),
        completado: false, enviar_email: nuevoRecEmail,
      })
    }

    setNuevo(''); setNuevoConRec(false); setNuevoRecFecha(''); setNuevoRecEmail(false)
    cargar()
  }

  async function toggle(p: Paso) {
    if (p.completado) { setConfirmUncheckId(p.id); return }
    await supabase.from('clientes_pasos').update({
      completado: true, completado_por: usuarioId,
      completado_at: new Date().toISOString(),
    }).eq('id', p.id)
    cargar()
  }

  async function confirmarUncheck() {
    if (!confirmUncheckId) return
    await supabase.from('clientes_pasos').update({
      completado: false, completado_por: null, completado_at: null,
    }).eq('id', confirmUncheckId)
    setConfirmUncheckId(null)
    cargar()
  }

  async function eliminar(id: string) {
    await supabase.from('clientes_pasos').delete().eq('id', id)
    cargar()
  }

  async function crearRecordatorio(paso: Paso) {
    if (!recFecha || savingRec) return
    setSavingRec(true)
    await supabase.from('recordatorios').insert({
      cliente_id: clienteId, tenant_id: tenantId, asignado_a: usuarioId,
      nota: paso.descripcion, fecha_recordatorio: new Date(recFecha).toISOString(),
      completado: false, enviar_email: recEmail,
    })
    setSavingRec(false)
    setRecAbierto(null); setRecFecha(''); setRecEmail(false)
  }

  if (loading) return <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pasos a seguir</p>

      {/* Formulario agregar */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
        <div className="flex gap-2">
          <input value={nuevo} onChange={e => setNuevo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !nuevoConRec) agregar() }}
            placeholder="ej: Confirmar dirección de entrega"
            className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <button onClick={agregar} disabled={!nuevo.trim()}
            className="px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
            + Agregar
          </button>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={nuevoConRec} onChange={e => setNuevoConRec(e.target.checked)}
            className="rounded" />
          <span className="text-xs text-gray-600">⏰ Con recordatorio</span>
        </label>

        {nuevoConRec && (
          <div className="mt-1 space-y-1.5 pl-1">
            <input type="datetime-local" value={nuevoRecFecha} onChange={e => setNuevoRecFecha(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={nuevoRecEmail} onChange={e => setNuevoRecEmail(e.target.checked)} className="rounded" />
              <span className="text-xs text-gray-600">📧 Enviar por correo</span>
            </label>
          </div>
        )}
      </div>

      {pasos.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin pasos definidos</p>}

      <div className="space-y-1.5">
        {pasos.map(p => (
          <div key={p.id} className="rounded-xl border border-gray-200 overflow-hidden">
            {/* Fila principal del paso */}
            <div className={`flex items-center gap-2 px-3 py-2 ${
              confirmUncheckId === p.id ? 'bg-red-50' : p.completado ? 'bg-green-50' : 'bg-white'
            }`}>
              <input type="checkbox" checked={p.completado} onChange={() => toggle(p)} className="flex-shrink-0" />
              <span className={`flex-1 text-sm ${p.completado ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {p.descripcion}
              </span>
              {confirmUncheckId !== p.id && !p.completado && (
                <button
                  onClick={() => {
                    if (recAbierto === p.id) { setRecAbierto(null); setRecFecha(''); setRecEmail(false) }
                    else { setRecAbierto(p.id); setRecFecha(''); setRecEmail(false) }
                  }}
                  className="flex-shrink-0 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 transition-colors"
                  title="Agregar recordatorio a este paso">
                  ⏰
                </button>
              )}
              {confirmUncheckId !== p.id && (
                <button onClick={() => eliminar(p.id)} className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
              )}
            </div>

            {/* Panel recordatorio por paso */}
            {recAbierto === p.id && (
              <div className="bg-amber-50 border-t border-amber-200 px-3 py-2 space-y-1.5">
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Recordatorio para este paso</p>
                <input type="datetime-local" value={recFecha} onChange={e => setRecFecha(e.target.value)}
                  className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={recEmail} onChange={e => setRecEmail(e.target.checked)} className="rounded" />
                  <span className="text-xs text-amber-700">📧 Enviar por correo</span>
                </label>
                <div className="flex gap-2">
                  <button onClick={() => crearRecordatorio(p)} disabled={!recFecha || savingRec}
                    className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-40 transition-colors">
                    {savingRec ? '...' : 'Crear recordatorio'}
                  </button>
                  <button onClick={() => { setRecAbierto(null); setRecFecha(''); setRecEmail(false) }}
                    className="px-2.5 py-1.5 border border-amber-200 text-amber-600 hover:bg-amber-100 rounded-lg text-xs transition-colors">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Confirmación desmarcar */}
            {confirmUncheckId === p.id && (
              <div className="bg-red-50 border-t border-red-200 px-3 py-2 text-xs text-red-700">
                <p className="font-semibold mb-2">¿Estás seguro? Saldrá como si no se hubiera completado.</p>
                <div className="flex gap-2">
                  <button onClick={confirmarUncheck}
                    className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold">
                    Sí, desmarcar
                  </button>
                  <button onClick={() => setConfirmUncheckId(null)}
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
  )
}
