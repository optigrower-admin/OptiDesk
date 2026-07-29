'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ETAPAS, ETAPA_MAP, tiempoSinResponder, estadoSeguimiento, type EtapaVenta } from '@/lib/ventas/pipeline'
import type { LeadData } from './components/LeadCard'
import FichaProspecto from './components/FichaProspecto'
import { useEtapasPipeline } from '@/hooks/useEtapasPipeline'

/* ─── tipos ───────────────────────────────────────────────────────────────── */
interface Props {
  leads: LeadData[]
  tenantId: string
  usuarios: { id: string; nombre: string }[]
  onLeadPatch?: (id: string, patch: Record<string, unknown>) => void
  onLeadRemove?: (id: string) => void
}

type Mensaje = {
  id: string; direccion: 'entrante' | 'saliente'; tipo: string
  contenido: string | null; created_at: string; estado_envio: string
  enviado_por: string | null
  usuarios: { nombre: string | null; email: string | null; rol: string | null } | null
}

const CANAL_ICON: Record<string, string>  = { whatsapp: '📱', messenger: '💬', instagram: '📸', manual: '✍️' }
const CANAL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', manual: 'Manual' }

function urgencyScore(l: LeadData): number {
  let score = 0
  if (l.no_leidos_count > 0) score += 1000 + l.no_leidos_count
  if (l.sin_respuesta_asesor_desde && (Date.now() - new Date(l.sin_respuesta_asesor_desde).getTime()) > 15 * 60000) score += 500
  if (l.proxima_accion_fecha && new Date(l.proxima_accion_fecha) < new Date()) score += 300
  if (!l.proxima_accion_fecha) score += 100
  return score
}

function fmtHora(d: string) {
  return new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}
function fmtFechaCorta(d: string) {
  const date = new Date(d)
  const hoy  = new Date()
  if (date.toDateString() === hoy.toDateString()) return fmtHora(d)
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

/* ─── Panel CRM derecho ───────────────────────────────────────────────────── */
function PanelCRM({ lead, tenantId, usuarios, onLeadUpdate }: {
  lead: LeadData; tenantId: string
  usuarios: { id: string; nombre: string }[]
  onLeadUpdate: (id: string, updates: Record<string, unknown>) => void
}) {
  const supabase = createClient()
  const { profile } = useAuth()

  const [etapa,         setEtapa]         = useState<EtapaVenta>(lead.etapa_venta)
  const [assignedTo,    setAssignedTo]    = useState(lead.assigned_to ?? '')
  const [proxAccion,    setProxAccion]    = useState(lead.proxima_accion ?? '')
  const [proxFecha,     setProxFecha]     = useState(
    lead.proxima_accion_fecha ? lead.proxima_accion_fecha.slice(0, 16) : ''
  )
  const [proxConRec,    setProxConRec]    = useState(false)
  const [nota,          setNota]          = useState('')
  const [saving,        setSaving]        = useState(false)
  const [savedOk,       setSavedOk]       = useState(false)
  const [reminderNota,  setReminderNota]  = useState('')
  const [reminderFecha, setReminderFecha] = useState('')
  const [showReminder,  setShowReminder]  = useState(false)

  const toast = useCallback(() => {
    setSavedOk(true); setTimeout(() => setSavedOk(false), 2000)
  }, [])

  async function guardarEtapa(e: EtapaVenta) {
    setEtapa(e)
    onLeadUpdate(lead.id, { etapa_venta: e })
    await fetch('/api/admin/ventas/guardar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: lead.id, etapa_venta: e }),
    })
    toast()
  }

  async function guardarAsesor(uid: string) {
    setAssignedTo(uid)
    onLeadUpdate(lead.id, { assigned_to: uid || null })
    await supabase.from('clientes').update({ assigned_to: uid || null }).eq('id', lead.id)
    toast()
  }

  async function guardarProxima() {
    const accion = proxAccion.trim() || null
    const fecha  = proxFecha ? new Date(proxFecha).toISOString() : null
    if (proxConRec && accion && fecha && profile?.id && lead.cliente?.id) {
      await supabase.from('recordatorios').insert({
        cliente_id: lead.cliente.id, tenant_id: tenantId, asignado_a: profile.id,
        nota: accion, fecha_recordatorio: fecha, completado: false, tipo: 'manual',
      })
    }
    onLeadUpdate(lead.id, { proxima_accion: accion, proxima_accion_fecha: fecha })
    await supabase.from('clientes').update({ proxima_accion: accion, proxima_accion_fecha: fecha }).eq('id', lead.id)
    setProxConRec(false)
    toast()
  }

  async function guardarNota() {
    if (!nota.trim() || !profile?.id || !lead.cliente?.id) return
    setSaving(true)
    await supabase.from('comentarios').insert({
      cliente_id: lead.cliente.id, tenant_id: tenantId,
      usuario_id: profile.id, contenido: nota.trim(), tipo: 'nota_interna',
    })
    setNota(''); setSaving(false); toast()
  }

  async function guardarRecordatorio() {
    if (!reminderFecha || !profile?.id || !lead.cliente?.id) return
    setSaving(true)
    await supabase.from('recordatorios').insert({
      cliente_id: lead.cliente.id, tenant_id: tenantId,
      asignado_a: profile.id, nota: reminderNota || null,
      fecha_recordatorio: new Date(reminderFecha).toISOString(), completado: false,
    })
    setReminderNota(''); setReminderFecha(''); setShowReminder(false); setSaving(false); toast()
  }

  const etapaConfig = ETAPA_MAP[etapa]

  return (
    <div className="h-full flex flex-col bg-[#1a2235] text-white overflow-y-auto">
      {/* Badge guardado */}
      {savedOk && (
        <div className="absolute top-3 right-3 z-10 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
          ✓ Guardado
        </div>
      )}

      <div className="px-4 pt-4 pb-2 border-b border-white/10 flex-shrink-0">
        <p className="font-black text-base truncate">{lead.cliente?.nombre ?? 'Sin nombre'}</p>
        <p className="text-xs text-white/50 mt-0.5">{lead.cliente?.celular ?? '—'}</p>
      </div>

      <div className="flex-1 px-4 py-3 space-y-4 overflow-y-auto">

        {/* Etapa */}
        <div>
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">Etapa</label>
          <select value={etapa} onChange={e => guardarEtapa(e.target.value as EtapaVenta)}
            className="w-full text-xs rounded-lg px-2.5 py-2 font-bold text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-400"
            style={{ background: etapaConfig.color }}>
            {ETAPAS.map(e => (
              <option key={e.id} value={e.id} style={{ background: e.color }}>{e.label}</option>
            ))}
          </select>
        </div>

        {/* Asesor */}
        <div>
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">Asesor</label>
          <select value={assignedTo} onChange={e => guardarAsesor(e.target.value)}
            className="w-full text-xs bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-400">
            <option value="">Sin asignar</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>

        {/* Próxima acción */}
        <div>
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">Próxima acción</label>
          <input value={proxAccion} onChange={e => setProxAccion(e.target.value)}
            placeholder="Ej: Llamar para confirmar entrega"
            className="w-full text-xs bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-400 mb-1.5" />
          <input type="datetime-local" value={proxFecha} onChange={e => setProxFecha(e.target.value)}
            className="w-full text-[11px] bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:ring-1 focus:ring-blue-400 mb-1.5" />
          <label className="flex items-center gap-2 mb-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={proxConRec} onChange={e => setProxConRec(e.target.checked)} className="rounded" />
            <span className="text-[10px] text-white/60">⏰ Crear también como recordatorio</span>
          </label>
          <button onClick={guardarProxima}
            className="w-full py-1.5 text-xs font-bold bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors">
            Guardar acción
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10" />

        {/* Nota rápida */}
        <div>
          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">Nota rápida</label>
          <textarea value={nota} onChange={e => setNota(e.target.value)}
            rows={2} placeholder="Añade una nota interna..."
            className="w-full text-xs bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none mb-1.5" />
          <button onClick={guardarNota} disabled={saving || !nota.trim()}
            className="w-full py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-40">
            {saving ? 'Guardando...' : '💬 Guardar nota'}
          </button>
        </div>

        {/* Recordatorio rápido */}
        <div>
          <button onClick={() => setShowReminder(v => !v)}
            className="w-full py-1.5 text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg transition-colors">
            ⏰ {showReminder ? 'Cancelar recordatorio' : 'Agregar recordatorio'}
          </button>
          {showReminder && (
            <div className="mt-2 space-y-1.5">
              <input type="datetime-local" value={reminderFecha} onChange={e => setReminderFecha(e.target.value)}
                className="w-full text-[11px] bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
              <input type="text" value={reminderNota} onChange={e => setReminderNota(e.target.value)}
                placeholder="Nota del recordatorio"
                className="w-full text-xs bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400" />
              <button onClick={guardarRecordatorio} disabled={saving || !reminderFecha}
                className="w-full py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-40">
                {saving ? '...' : 'Crear recordatorio'}
              </button>
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className="space-y-1">
          {!lead.cliente?.celular && (
            <div className="text-[10px] font-bold text-orange-300 bg-orange-500/20 rounded-lg px-2.5 py-1.5">⚠ Sin número de celular</div>
          )}
          {lead.tienePlaca === false && (
            <div className="text-[10px] font-bold text-red-300 bg-red-500/20 rounded-lg px-2.5 py-1.5">⚠ Sin placa asignada</div>
          )}
          {lead.tieneAlistamiento === false && (lead.etapa_venta === 'espera_entrega' || lead.etapa_venta === 'entregada') && (
            <div className="text-[10px] font-bold text-red-300 bg-red-500/20 rounded-lg px-2.5 py-1.5">⚠ Falta alistamiento</div>
          )}
          {!lead.numero_factura && ['ganado','aprobado_matricula','en_matricula','alistamiento'].includes(lead.etapa_venta) && (
            <div className="text-[10px] font-bold text-yellow-300 bg-yellow-500/20 rounded-lg px-2.5 py-1.5">⚠ Sin número de factura</div>
          )}
        </div>

      </div>
    </div>
  )
}

/* ─── Componente principal ────────────────────────────────────────────────── */
export default function VistaBandeja({ leads, tenantId, usuarios, onLeadPatch, onLeadRemove }: Props) {
  const etapasPipeline = useEtapasPipeline(tenantId)
  const supabase = createClient()
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [mensajes,    setMensajes]    = useState<Mensaje[]>([])
  const [input,       setInput]       = useState('')
  const [sending,     setSending]     = useState(false)
  const [fichaId,     setFichaId]     = useState<string | null>(null)
  const [leadsLocal,  setLeadsLocal]  = useState<LeadData[]>(leads)
  const [busqueda,    setBusqueda]    = useState('')
  const endRef   = useRef<HTMLDivElement>(null)
  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u.nombre]))

  useEffect(() => { setLeadsLocal(leads) }, [leads])

  const sorted = useMemo(() => [...leadsLocal]
    .filter(l => {
      if (!busqueda.trim()) return true
      const q = busqueda.toLowerCase()
      return l.cliente?.nombre?.toLowerCase().includes(q) || l.cliente?.celular?.includes(q)
    })
    .sort((a, b) => urgencyScore(b) - urgencyScore(a)),
  [leadsLocal, busqueda])

  const selectedLead = selectedId ? leadsLocal.find(l => l.id === selectedId) ?? null : null
  const convId = selectedLead?.todas_conversaciones[0]?.id ?? selectedLead?.id

  // Cargar mensajes cuando cambia el cliente seleccionado
  useEffect(() => {
    if (!convId) { setMensajes([]); return }
    supabase.from('mensajes')
      .select('id,direccion,tipo,contenido,created_at,estado_envio,enviado_por,usuarios(nombre,email,rol)')
      .eq('conversacion_id', convId).order('created_at').limit(200)
      .then(({ data }) => setMensajes((data ?? []) as unknown as Mensaje[]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  async function enviar() {
    const texto = input.trim()
    if (!texto || sending || !convId) return
    setSending(true); setInput('')
    try {
      const res = await fetch('/api/admin/mensajes/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: convId, contenido: texto, tipo: 'texto' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.mensaje) setMensajes(p => [...p, json.mensaje as Mensaje])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al enviar')
      setInput(texto)
    } finally { setSending(false) }
  }

  function handleLeadUpdate(id: string, updates: Record<string, unknown>) {
    setLeadsLocal(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, ...updates }
      // placa y celular viven en el objeto cliente anidado además del top-level
      if ('placa' in updates)
        updated.cliente = l.cliente ? { ...l.cliente, placa: (updates.placa as string | null) ?? null } : l.cliente
      if ('celular' in updates)
        updated.cliente = updated.cliente ? { ...updated.cliente, celular: (updates.celular as string | null) ?? null } : updated.cliente
      return updated
    }))
    onLeadPatch?.(id, updates)
  }

  const fichaLead = fichaId ? leadsLocal.find(l => l.id === fichaId) ?? null : null

  return (
    <div className="flex h-[calc(100vh-200px)] gap-0 rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-white">

      {/* ── Panel izquierdo: lista de clientes ── */}
      <div className="w-72 flex-shrink-0 border-r border-gray-100 flex flex-col bg-gray-50">
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{sorted.length} clientes · ordenados por urgencia</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sorted.map(lead => {
            const sr = tiempoSinResponder(lead.sin_respuesta_asesor_desde)
            const sg = estadoSeguimiento(lead.proxima_accion_fecha)
            const isSelected = lead.id === selectedId
            const etapa = ETAPA_MAP[lead.etapa_venta]

            return (
              <button key={lead.id} onClick={() => setSelectedId(lead.id)}
                className={`w-full text-left px-3 py-3 border-b border-gray-100 transition-colors ${
                  isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-100'
                }`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-gray-900 truncate">
                        {lead.cliente?.nombre ?? 'Sin nombre'}
                      </span>
                      {lead.no_leidos_count > 0 && (
                        <span className="w-4 h-4 bg-green-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold flex-shrink-0">
                          {lead.no_leidos_count > 9 ? '9+' : lead.no_leidos_count}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold text-white"
                        style={{ background: etapa?.color }}>
                        {etapa?.label}
                      </span>
                      {lead.assigned_to && <span className="text-[9px] text-gray-400">{usuariosMap[lead.assigned_to]?.split(' ')[0]}</span>}
                    </div>
                    {sr.urgente && <p className="text-[9px] text-red-600 font-semibold mt-0.5">⚡ {sr.texto}</p>}
                    {!sr.urgente && sg === 'vencido' && <p className="text-[9px] text-red-500 mt-0.5">⏰ Seguimiento vencido</p>}
                    {!sr.urgente && sg !== 'vencido' && lead.proxima_accion && (
                      <p className="text-[9px] text-blue-600 mt-0.5 truncate">📌 {lead.proxima_accion}</p>
                    )}
                  </div>
                  <span className="text-[9px] text-gray-400 flex-shrink-0 mt-0.5">
                    {CANAL_ICON[lead.canal] ?? '💬'}
                  </span>
                </div>
              </button>
            )
          })}
          {sorted.length === 0 && (
            <div className="py-12 text-center text-xs text-gray-400">Sin clientes</div>
          )}
        </div>
      </div>

      {/* ── Panel central: chat ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedLead ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400 flex-col gap-2">
            <span className="text-3xl">👈</span>
            <p>Selecciona un cliente para ver la conversación</p>
          </div>
        ) : (
          <>
            {/* Header chat */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900">{selectedLead.cliente?.nombre ?? 'Sin nombre'}</p>
                <p className="text-xs text-gray-400">
                  {CANAL_LABEL[selectedLead.canal] ?? selectedLead.canal} · {selectedLead.cliente?.celular ?? '—'}
                </p>
              </div>
              <button onClick={() => setFichaId(selectedId)}
                className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors flex-shrink-0">
                Ver ficha completa →
              </button>
            </div>

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-gray-50">
              {mensajes.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">Sin mensajes aún</p>
              )}
              {mensajes.map(m => {
                const esSaliente = m.direccion === 'saliente'
                const esNota     = m.tipo === 'nota_interna'
                if (esNota) return (
                  <div key={m.id} className="flex justify-center">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 max-w-[75%] text-center">
                      <p className="text-[10px] font-bold text-amber-700 mb-0.5">📝 Nota interna</p>
                      <p className="text-xs text-amber-800">{m.contenido}</p>
                      <p className="text-[9px] text-amber-500 mt-0.5">{fmtHora(m.created_at)}</p>
                    </div>
                  </div>
                )
                return (
                  <div key={m.id} className={`flex ${esSaliente ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[72%] rounded-2xl px-3 py-2 ${
                      esSaliente ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                    }`}>
                      {!esSaliente && m.usuarios?.nombre && (
                        <p className="text-[9px] font-bold text-blue-600 mb-0.5">{m.usuarios.nombre}</p>
                      )}
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.contenido}</p>
                      <p className={`text-[9px] mt-1 text-right ${esSaliente ? 'text-blue-200' : 'text-gray-400'}`}>
                        {fmtHora(m.created_at)}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 p-3 bg-white flex-shrink-0">
              <div className="flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <button onClick={enviar} disabled={sending || !input.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors">
                  {sending ? '...' : 'Enviar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Panel derecho: CRM ── */}
      <div className="w-64 flex-shrink-0 border-l border-gray-100 relative">
        {selectedLead ? (
          <PanelCRM
            lead={selectedLead}
            tenantId={tenantId}
            usuarios={usuarios}
            onLeadUpdate={handleLeadUpdate}
          />
        ) : (
          <div className="h-full bg-[#1a2235] flex items-center justify-center">
            <p className="text-xs text-white/30 text-center px-4">Selecciona un cliente para ver el panel CRM</p>
          </div>
        )}
      </div>

      {/* Ficha completa */}
      {fichaLead && (
        <FichaProspecto
          key={fichaLead.id}
          lead={fichaLead}
          tenantId={tenantId}
          onClose={() => setFichaId(null)}
          onEtapaChange={(id, etapa) => handleLeadUpdate(id, { etapa_venta: etapa })}
          onLeadUpdate={(id, updates) => handleLeadUpdate(id, updates as Record<string, unknown>)}
          onLeadDelete={(id) => { setLeadsLocal(p => p.filter(l => l.id !== id)); setFichaId(null); onLeadRemove?.(id) }}
          etapasPipeline={etapasPipeline}
        />
      )}
    </div>
  )
}
