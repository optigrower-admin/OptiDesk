'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ETAPAS, ETAPA_MAP, type EtapaVenta } from '@/lib/ventas/pipeline'
import type { LeadData } from './LeadCard'

type Mensaje = {
  id: string
  direccion: 'entrante' | 'saliente'
  tipo: string
  contenido: string | null
  created_at: string
  estado_envio: string
}

type Orden = {
  id: string
  created_at: string
  estado: string
  descripcion_problema: string | null
}

interface Props {
  lead: LeadData
  tenantId: string
  onClose: () => void
  onEtapaChange: (id: string, etapa: EtapaVenta) => void
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export default function FichaProspecto({ lead, tenantId, onClose, onEtapaChange }: Props) {
  const supabase = createClient()
  const endRef   = useRef<HTMLDivElement>(null)

  const [mensajes, setMensajes]         = useState<Mensaje[]>([])
  const [ordenes, setOrdenes]           = useState<Orden[]>([])
  const [input, setInput]               = useState('')
  const [sending, setSending]           = useState(false)
  const [saving, setSaving]             = useState(false)

  // Campos editables de la venta
  const [motoInteres, setMotoInteres]   = useState(lead.moto_interes ?? '')
  const [presupuesto, setPresupuesto]   = useState<string>(lead.valor_estimado_venta?.toString() ?? '')
  const [proxAccion, setProxAccion]     = useState(lead.proxima_accion ?? '')
  const [proxFecha, setProxFecha]       = useState(
    lead.proxima_accion_fecha ? lead.proxima_accion_fecha.slice(0, 16) : ''
  )
  const [etapa, setEtapa]               = useState<EtapaVenta>(lead.etapa_venta)

  const cargar = useCallback(async () => {
    const [{ data: msgs }, { data: ords }] = await Promise.all([
      supabase.from('mensajes').select('id,direccion,tipo,contenido,created_at,estado_envio')
        .eq('conversacion_id', lead.id).order('created_at').limit(150),
      lead.cliente?.id
        ? supabase.from('ordenes').select('id,created_at,estado,descripcion_problema')
            .eq('cliente_id', lead.cliente.id).order('created_at', { ascending: false }).limit(5)
        : Promise.resolve({ data: [] }),
    ])
    setMensajes((msgs ?? []) as Mensaje[])
    setOrdenes((ords ?? []) as Orden[])
  }, [lead.id, lead.cliente?.id])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes])

  const enviar = async () => {
    const texto = input.trim()
    if (!texto || sending) return
    setSending(true); setInput('')
    try {
      const res = await fetch('/api/admin/mensajes/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: lead.id, contenido: texto }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.mensaje) setMensajes(p => [...p, json.mensaje])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al enviar')
      setInput(texto)
    } finally { setSending(false) }
  }

  const guardarVenta = async () => {
    setSaving(true)
    await supabase.from('conversaciones').update({
      moto_interes:          motoInteres || null,
      valor_estimado_venta:  presupuesto ? parseFloat(presupuesto) : null,
      proxima_accion:        proxAccion || null,
      proxima_accion_fecha:  proxFecha ? new Date(proxFecha).toISOString() : null,
      etapa_venta:           etapa,
      updated_at:            new Date().toISOString(),
    }).eq('id', lead.id)
    if (etapa !== lead.etapa_venta) onEtapaChange(lead.id, etapa)
    setSaving(false)
  }

  const etapaActual = ETAPA_MAP[etapa]

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <p className="font-bold text-gray-900">{lead.cliente?.nombre ?? 'Sin nombre'}</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white" style={{ background: etapaActual.color }}>
              {etapaActual.label}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Chat — 55% */}
          <div className="w-[55%] flex flex-col border-r">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-gray-50">
              {mensajes.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">Sin mensajes aún</p>
              )}
              {mensajes.map((m, i) => {
                const isOut  = m.direccion === 'saliente'
                const isNota = m.tipo === 'nota_interna'
                const showDate = i === 0 || formatDate(m.created_at) !== formatDate(mensajes[i-1].created_at)
                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="text-center my-2">
                        <span className="text-xs bg-gray-200 text-gray-500 px-3 py-0.5 rounded-full">{formatDate(m.created_at)}</span>
                      </div>
                    )}
                    {isNota ? (
                      <div className="flex justify-center">
                        <div className="max-w-xs bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5 text-xs text-yellow-800 italic">
                          📝 {m.contenido}
                          <span className="ml-1 text-yellow-500 not-italic">{formatTime(m.created_at)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs rounded-2xl px-3 py-1.5 shadow-sm text-sm ${
                          isOut ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                          <div className={`flex items-center justify-end gap-1 mt-0.5 text-xs ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>
                            <span>{formatTime(m.created_at)}</span>
                            {isOut && (
                              <span>
                                {m.estado_envio === 'leido' ? <span className="text-sky-300">✓✓</span>
                                 : m.estado_envio === 'enviado' ? <span className="opacity-60">✓</span>
                                 : m.estado_envio === 'fallido' ? <span className="text-red-300">✗</span>
                                 : <span className="opacity-50">⏳</span>}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>
            {/* Input */}
            <div className="border-t px-3 py-2 flex gap-2">
              <textarea
                value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                placeholder="Escribe un mensaje... (Enter para enviar)"
                rows={2}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <button onClick={enviar} disabled={!input.trim() || sending}
                className="w-9 h-9 self-end bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-colors">
                {sending
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>}
              </button>
            </div>
          </div>

          {/* Ficha de datos — 45% */}
          <div className="w-[45%] overflow-y-auto p-4 space-y-4">
            {/* Datos del cliente */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cliente</p>
              <p className="font-semibold text-gray-900">{lead.cliente?.nombre ?? '—'}</p>
              {lead.cliente?.celular && <p className="text-sm text-gray-600">{lead.cliente.celular}</p>}
              {lead.lead_source && <p className="text-xs text-gray-400 mt-1">Origen: {lead.lead_source}</p>}
              {lead.cliente?.id && (
                <a href={`/admin/clientes/${lead.cliente.id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                  Ver perfil completo →
                </a>
              )}
            </div>

            {/* Datos de venta */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Datos de la venta</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500">Moto de interés</label>
                  <input value={motoInteres} onChange={e => setMotoInteres(e.target.value)}
                    placeholder="ej: Honda CB 190R · roja"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Valor estimado (COP)</label>
                  <input type="number" value={presupuesto} onChange={e => setPresupuesto(e.target.value)}
                    placeholder="ej: 9500000"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Etapa</label>
                  <select value={etapa} onChange={e => setEtapa(e.target.value as EtapaVenta)}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5">
                    {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Próxima acción */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Próxima acción</p>
              {!proxAccion && !proxFecha && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                  ⚠️ Define la próxima acción para no perder este prospecto
                </p>
              )}
              <input value={proxAccion} onChange={e => setProxAccion(e.target.value)}
                placeholder="ej: Llamar para confirmar cita"
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
              <input type="datetime-local" value={proxFecha} onChange={e => setProxFecha(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Historial de servicio */}
            {ordenes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Historial de servicio <span className="text-blue-600">({ordenes.length})</span>
                </p>
                <div className="space-y-1.5">
                  {ordenes.map(o => (
                    <div key={o.id} className="bg-blue-50 rounded-lg px-3 py-2">
                      <p className="text-xs font-semibold text-blue-800">{formatDate(o.created_at)} · {o.estado}</p>
                      {o.descripcion_problema && (
                        <p className="text-xs text-blue-600 truncate">{o.descripcion_problema}</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Cliente recurrente ✓</p>
              </div>
            )}

            {/* Botón guardar */}
            <button onClick={guardarVenta} disabled={saving}
              className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
