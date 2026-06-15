'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ETAPAS, ETAPA_MAP, type EtapaVenta } from '@/lib/ventas/pipeline'
import type { LeadData } from './LeadCard'

type Usuario = { nombre: string; email: string; rol: string } | null

type Mensaje = {
  id: string
  direccion: 'entrante' | 'saliente'
  tipo: string
  contenido: string | null
  created_at: string
  estado_envio: string
  enviado_por: string | null
  usuarios: Usuario
}

type Orden = {
  id: string
  created_at: string
  estado: string
  descripcion_problema: string | null
}

type EtapaHistorial = {
  id: string
  etapa_anterior: string | null
  etapa_nueva: string
  created_at: string
  dias_en_etapa: number | null
  usuarios: Usuario
}

type Recordatorio = {
  id: string
  nota: string | null
  fecha_recordatorio: string
  completado: boolean
  created_at: string
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
function formatDateHour(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Admin', superadmin: 'SuperAdmin', mecanico: 'Mecánico', gerencia: 'Gerencia',
}

type TabDerecha = 'datos' | 'historial'

export default function FichaProspecto({ lead, tenantId, onClose, onEtapaChange }: Props) {
  const supabase = createClient()
  const endRef   = useRef<HTMLDivElement>(null)

  const [mensajes, setMensajes]             = useState<Mensaje[]>([])
  const [ordenes, setOrdenes]               = useState<Orden[]>([])
  const [historialEtapas, setHistorialEtapas] = useState<EtapaHistorial[]>([])
  const [recordatorios, setRecordatorios]   = useState<Recordatorio[]>([])
  const [input, setInput]                   = useState('')
  const [tipoMsg, setTipoMsg]               = useState<'mensaje' | 'nota'>('mensaje')
  const [sending, setSending]               = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [tabDer, setTabDer]                 = useState<TabDerecha>('datos')

  // Campos editables
  const [motoInteres, setMotoInteres]   = useState(lead.moto_interes ?? '')
  const [presupuesto, setPresupuesto]   = useState(lead.valor_estimado_venta?.toString() ?? '')
  const [proxAccion, setProxAccion]     = useState(lead.proxima_accion ?? '')
  const [proxFecha, setProxFecha]       = useState(
    lead.proxima_accion_fecha ? lead.proxima_accion_fecha.slice(0, 16) : ''
  )
  const [etapa, setEtapa] = useState<EtapaVenta>(lead.etapa_venta)

  const cargar = useCallback(async () => {
    const [{ data: msgs }, { data: ords }, { data: hist }, { data: recs }] = await Promise.all([
      supabase
        .from('mensajes')
        .select('id,direccion,tipo,contenido,created_at,estado_envio,enviado_por,usuarios(nombre,email,rol)')
        .eq('conversacion_id', lead.id)
        .order('created_at')
        .limit(200),
      lead.cliente?.id
        ? supabase.from('ordenes').select('id,created_at,estado,descripcion_problema')
            .eq('cliente_id', lead.cliente.id).order('created_at', { ascending: false }).limit(5)
        : Promise.resolve({ data: [] }),
      supabase
        .from('historial_etapas')
        .select('id,etapa_anterior,etapa_nueva,created_at,dias_en_etapa,usuarios(nombre,email,rol)')
        .eq('conversacion_id', lead.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('recordatorios')
        .select('id,nota,fecha_recordatorio,completado,created_at')
        .eq('conversacion_id', lead.id)
        .order('fecha_recordatorio'),
    ])
    setMensajes((msgs ?? []) as Mensaje[])
    setOrdenes((ords ?? []) as Orden[])
    setHistorialEtapas((hist ?? []) as EtapaHistorial[])
    setRecordatorios((recs ?? []) as Recordatorio[])
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
        body: JSON.stringify({
          conversacion_id: lead.id,
          contenido: texto,
          tipo: tipoMsg === 'nota' ? 'nota_interna' : 'texto',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.mensaje) setMensajes(p => [...p, json.mensaje as Mensaje])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al enviar')
      setInput(texto)
    } finally { setSending(false) }
  }

  const guardarVenta = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ventas/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversacion_id:      lead.id,
          moto_interes:         motoInteres || null,
          valor_estimado_venta: presupuesto ? parseFloat(presupuesto) : null,
          proxima_accion:       proxAccion || null,
          proxima_accion_fecha: proxFecha ? new Date(proxFecha).toISOString() : null,
          etapa_venta:          etapa,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Error al guardar')
      }
      if (etapa !== lead.etapa_venta) onEtapaChange(lead.id, etapa)
      // Refresh historial if etapa changed
      if (etapa !== lead.etapa_venta) cargar()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const etapaActual = ETAPA_MAP[etapa]

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <p className="font-bold text-gray-900">{lead.cliente?.nombre ?? 'Sin nombre'}</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white"
              style={{ background: etapaActual.color }}>
              {etapaActual.label}
            </span>
            {lead.cliente?.celular && (
              <span className="text-xs text-gray-400">{lead.cliente.celular}</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* ── Chat (55%) ── */}
          <div className="w-[55%] flex flex-col border-r">
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-gray-50">
              {mensajes.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">Sin mensajes aún</p>
              )}
              {mensajes.map((m, i) => {
                const isOut  = m.direccion === 'saliente'
                const isNota = m.tipo === 'nota_interna'
                const showDate = i === 0 || formatDate(m.created_at) !== formatDate(mensajes[i-1].created_at)
                const usuario = Array.isArray(m.usuarios) ? m.usuarios[0] : m.usuarios

                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="text-center my-2">
                        <span className="text-xs bg-gray-200 text-gray-500 px-3 py-0.5 rounded-full">
                          {formatDate(m.created_at)}
                        </span>
                      </div>
                    )}

                    {isNota ? (
                      <div className="flex justify-center my-1">
                        <div className="max-w-sm bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-xs text-yellow-800">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="font-semibold">📝 Nota interna</span>
                            {usuario && (
                              <span className="text-yellow-600">
                                · {usuario.nombre} ({ROL_LABEL[usuario.rol] ?? usuario.rol})
                              </span>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap">{m.contenido}</p>
                          <p className="text-yellow-500 mt-1 text-right">{formatTime(m.created_at)}</p>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex flex-col ${isOut ? 'items-end' : 'items-start'} mb-1`}>
                        {isOut && usuario && (
                          <p className="text-xs text-gray-400 mb-0.5 px-1">
                            {usuario.nombre} · <span className="italic">{ROL_LABEL[usuario.rol] ?? usuario.rol}</span>
                            {usuario.email && <span className="text-gray-300"> · {usuario.email}</span>}
                          </p>
                        )}
                        <div className={`max-w-xs rounded-2xl px-3 py-2 shadow-sm text-sm ${
                          isOut ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                          <div className={`flex items-center justify-end gap-1 mt-0.5 text-xs ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>
                            <span>{formatTime(m.created_at)}</span>
                            {isOut && (
                              <span>
                                {m.estado_envio === 'leido'   ? <span className="text-sky-300">✓✓</span>
                                 : m.estado_envio === 'enviado' ? <span className="opacity-60">✓</span>
                                 : m.estado_envio === 'fallido' ? <span className="text-red-300">✗</span>
                                 : <span className="opacity-40">⏳</span>}
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

            {/* Input area */}
            <div className="border-t bg-white">
              {/* Tabs mensaje / nota */}
              <div className="flex border-b">
                <button
                  onClick={() => setTipoMsg('mensaje')}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    tipoMsg === 'mensaje'
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  💬 Mensaje al cliente
                </button>
                <button
                  onClick={() => setTipoMsg('nota')}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    tipoMsg === 'nota'
                      ? 'bg-yellow-50 text-yellow-700 border-b-2 border-yellow-500'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📝 Nota interna
                </button>
              </div>
              <div className="px-3 py-2 flex gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  placeholder={
                    tipoMsg === 'nota'
                      ? 'Escribe una nota interna (solo visible para el equipo)...'
                      : 'Escribe un mensaje al cliente... (Enter para enviar)'
                  }
                  rows={4}
                  className={`flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${
                    tipoMsg === 'nota'
                      ? 'border-yellow-200 bg-yellow-50 focus:ring-yellow-400'
                      : 'border-gray-200 focus:ring-blue-500'
                  }`}
                />
                <button
                  onClick={enviar}
                  disabled={!input.trim() || sending}
                  className={`w-9 h-9 self-end rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                    tipoMsg === 'nota'
                      ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {sending
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>}
                </button>
              </div>
            </div>
          </div>

          {/* ── Panel derecho (45%) ── */}
          <div className="w-[45%] flex flex-col min-h-0">
            {/* Tabs derecha */}
            <div className="flex border-b flex-shrink-0">
              <button
                onClick={() => setTabDer('datos')}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  tabDer === 'datos'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                📋 Datos de venta
              </button>
              <button
                onClick={() => setTabDer('historial')}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  tabDer === 'historial'
                    ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                📅 Historial
                {(historialEtapas.length > 0 || recordatorios.length > 0) && (
                  <span className="ml-1 bg-purple-600 text-white text-xs rounded-full px-1.5">
                    {historialEtapas.length + recordatorios.length}
                  </span>
                )}
              </button>
            </div>

            {/* Contenido tab derecha */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {tabDer === 'datos' && (
                <>
                  {/* Cliente */}
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

                  {/* Datos venta */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Datos de la venta</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-500">Etapa</label>
                        <select value={etapa} onChange={e => setEtapa(e.target.value as EtapaVenta)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5">
                          {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                        </select>
                      </div>
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
                    </div>
                  </div>

                  {/* Próxima acción */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Próxima acción</p>
                    {!proxAccion && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                        ⚠️ Define la próxima acción
                      </p>
                    )}
                    <input value={proxAccion} onChange={e => setProxAccion(e.target.value)}
                      placeholder="ej: Llamar para confirmar cita"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
                    <input type="datetime-local" value={proxFecha} onChange={e => setProxFecha(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {/* Historial servicio */}
                  {ordenes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Historial de servicio ({ordenes.length})
                      </p>
                      {ordenes.map(o => (
                        <div key={o.id} className="bg-blue-50 rounded-lg px-3 py-2 mb-1.5">
                          <p className="text-xs font-semibold text-blue-800">{formatDate(o.created_at)} · {o.estado}</p>
                          {o.descripcion_problema && <p className="text-xs text-blue-600 truncate">{o.descripcion_problema}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={guardarVenta} disabled={saving}
                    className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </>
              )}

              {tabDer === 'historial' && (
                <div className="space-y-3">
                  {historialEtapas.length === 0 && recordatorios.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-8">
                      Sin historial aún. Los movimientos del Kanban aparecerán aquí.
                    </p>
                  )}

                  {/* Recordatorios futuros */}
                  {recordatorios.filter(r => !r.completado && new Date(r.fecha_recordatorio) > new Date()).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">📌 Próximos eventos</p>
                      {recordatorios
                        .filter(r => !r.completado && new Date(r.fecha_recordatorio) > new Date())
                        .map(r => (
                          <div key={r.id} className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-2">
                            <p className="text-xs font-semibold text-blue-800">{formatDateHour(r.fecha_recordatorio)}</p>
                            {r.nota && <p className="text-xs text-blue-700 mt-0.5">{r.nota}</p>}
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Historial de etapas */}
                  {historialEtapas.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">🔄 Movimientos de etapa</p>
                      <div className="relative pl-4 border-l-2 border-gray-200 space-y-3">
                        {historialEtapas.map(h => {
                          const etapaNuevaConf  = ETAPA_MAP[h.etapa_nueva  as EtapaVenta]
                          const etapaPrevConf   = h.etapa_anterior ? ETAPA_MAP[h.etapa_anterior as EtapaVenta] : null
                          const usuario = Array.isArray(h.usuarios) ? h.usuarios[0] : h.usuarios
                          return (
                            <div key={h.id} className="relative">
                              <div className="absolute -left-5 w-3 h-3 rounded-full border-2 border-white mt-0.5"
                                style={{ background: etapaNuevaConf?.color ?? '#888' }} />
                              <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {etapaPrevConf && (
                                    <>
                                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                                        style={{ background: etapaPrevConf.color }}>{etapaPrevConf.label}</span>
                                      <span className="text-gray-400 text-xs">→</span>
                                    </>
                                  )}
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                                    style={{ background: etapaNuevaConf?.color ?? '#888' }}>
                                    {etapaNuevaConf?.label ?? h.etapa_nueva}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{formatDateHour(h.created_at)}</p>
                                {usuario && (
                                  <p className="text-xs text-gray-500">
                                    {usuario.nombre} · {ROL_LABEL[usuario.rol] ?? usuario.rol}
                                  </p>
                                )}
                                {h.dias_en_etapa !== null && h.dias_en_etapa > 0 && (
                                  <p className="text-xs text-gray-400 italic">
                                    {h.dias_en_etapa < 1
                                      ? `${Math.round(h.dias_en_etapa * 24)}h en etapa anterior`
                                      : `${h.dias_en_etapa.toFixed(1)} días en etapa anterior`}
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Recordatorios pasados */}
                  {recordatorios.filter(r => r.completado || new Date(r.fecha_recordatorio) <= new Date()).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">✅ Eventos pasados</p>
                      {recordatorios
                        .filter(r => r.completado || new Date(r.fecha_recordatorio) <= new Date())
                        .map(r => (
                          <div key={r.id} className={`rounded-xl px-3 py-2 mb-2 border ${
                            r.completado ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                          }`}>
                            <p className={`text-xs font-semibold ${r.completado ? 'text-green-700' : 'text-gray-600'}`}>
                              {r.completado ? '✓ ' : ''}{formatDateHour(r.fecha_recordatorio)}
                            </p>
                            {r.nota && <p className="text-xs text-gray-600 mt-0.5">{r.nota}</p>}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
