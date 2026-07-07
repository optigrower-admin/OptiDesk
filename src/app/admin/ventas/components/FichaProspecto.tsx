'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { ETAPAS, ETAPA_MAP, type EtapaVenta } from '@/lib/ventas/pipeline'
import type { LeadData } from './LeadCard'
import VincularClienteModal from './VincularClienteModal'
import ResumenTab from './ficha/ResumenTab'
import DatosClienteTab from './ficha/DatosClienteTab'
import MotosInteresTab from './ficha/MotosInteresTab'
import PagoTab from './ficha/PagoTab'
import ArchivosTab from './ficha/ArchivosTab'
import ComentariosTab from './ficha/ComentariosTab'
import PasosTab from './ficha/PasosTab'
import RecordatoriosTab from './ficha/RecordatoriosTab'
import HistorialTab from './ficha/HistorialTab'
import VisibilidadTab from './ficha/VisibilidadTab'
import CotizacionTab from './ficha/CotizacionTab'

const CANAL_ICON: Record<string, string> = {
  whatsapp: '📱', messenger: '💬', instagram: '📸', manual: '✍️',
}
const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram', manual: 'Manual',
}

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

interface Props {
  lead: LeadData
  tenantId: string
  onClose: () => void
  onEtapaChange: (id: string, etapa: EtapaVenta) => void
  onLeadUpdate?: (id: string, updates: { proxima_accion?: string | null; proxima_accion_fecha?: string | null; nombre?: string; nombre_pendiente_aprobacion?: boolean | null }) => void
  onLeadDelete?: (id: string) => void
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

const ROL_LABEL: Record<string, string> = {
  admin: 'Admin', superadmin: 'SuperAdmin', mecanico: 'Mecánico', gerencia: 'Gerencia', control_total: 'Control total',
}

type TabDerecha = 'resumen' | 'datos' | 'motos' | 'cotizacion' | 'pago' | 'archivos' | 'comentarios' | 'pasos' | 'recordatorios' | 'historial' | 'visibilidad'

const TABS: { id: TabDerecha; label: string; icon: string }[] = [
  { id: 'resumen',       label: 'Resumen',       icon: '📋' },
  { id: 'datos',         label: 'Datos',         icon: '🪪' },
  { id: 'motos',         label: 'Motos',         icon: '🏍️' },
  { id: 'cotizacion',    label: 'Cotización',    icon: '📄' },
  { id: 'pago',          label: 'Pago',          icon: '💳' },
  { id: 'archivos',      label: 'Archivos',      icon: '📎' },
  { id: 'comentarios',   label: 'Comentarios',   icon: '💬' },
  { id: 'pasos',         label: 'Pasos',         icon: '✅' },
  { id: 'recordatorios', label: 'Recordatorios', icon: '⏰' },
  { id: 'historial',     label: 'Historial',     icon: '📅' },
]

export default function FichaProspecto({ lead, tenantId, onClose, onEtapaChange, onLeadUpdate, onLeadDelete }: Props) {
  const supabase = createClient()
  const { profile } = useAuth()
  const endRef   = useRef<HTMLDivElement>(null)
  const esGerencia = profile?.rol === 'gerencia' || profile?.rol === 'control_total'

  const [mensajes, setMensajes]         = useState<Mensaje[]>([])
  const [ordenes, setOrdenes]           = useState<Orden[]>([])
  const [usuarios, setUsuarios]         = useState<{ id: string; nombre: string }[]>([])
  const [clienteEmail, setClienteEmail] = useState<string | null>(null)
  const [input, setInput]               = useState('')
  const [tipoMsg, setTipoMsg]           = useState<'mensaje' | 'nota'>('mensaje')
  const [sending, setSending]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [tabDer, setTabDer]             = useState<TabDerecha>('resumen')
  const [vincularOpen, setVincularOpen] = useState(false)
  const [convActivaId, setConvActivaId] = useState(lead.todas_conversaciones[0]?.id ?? '')

  // Renombrar / eliminar cliente (solo Gerencia)
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [nuevoNombre, setNuevoNombre]       = useState(lead.cliente?.nombre ?? '')
  const [savingNombre, setSavingNombre]     = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState(false)
  const [confirmDeleteInput, setConfirmDeleteInput] = useState('')
  const [deleting, setDeleting]             = useState(false)

  // Campos editables — tab Resumen
  const [etapa, setEtapa]         = useState<EtapaVenta>(lead.etapa_venta)
  const [assignedTo, setAssignedTo] = useState('')

  const cargar = useCallback(async () => {
    const [{ data: msgs }, { data: ords }, { data: us }, { data: cliente }] = await Promise.all([
      convActivaId
        ? supabase.from('mensajes')
            .select('id,direccion,tipo,contenido,created_at,estado_envio,enviado_por,usuarios(nombre,email,rol)')
            .eq('conversacion_id', convActivaId).order('created_at').limit(200)
        : Promise.resolve({ data: [] }),
      supabase.from('ordenes').select('id,created_at,estado,descripcion_problema')
        .eq('cliente_id', lead.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('usuarios').select('id, nombre').eq('tenant_id', tenantId).eq('activo', true),
      supabase.from('clientes').select('email, assigned_to').eq('id', lead.id).single(),
    ])
    setMensajes((msgs ?? []) as unknown as Mensaje[])
    setOrdenes((ords ?? []) as Orden[])
    setUsuarios((us ?? []) as { id: string; nombre: string }[])
    setClienteEmail(cliente?.email ?? null)
    setAssignedTo(cliente?.assigned_to ?? '')
  }, [lead.id, convActivaId, tenantId])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes])

  const enviar = async () => {
    const texto = input.trim()
    if (!texto || sending || !convActivaId) return
    setSending(true); setInput('')
    try {
      const res = await fetch('/api/admin/mensajes/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversacion_id: convActivaId,
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
          cliente_id:  lead.id,
          etapa_venta: etapa,
          ...(esGerencia ? { assigned_to: assignedTo || null } : {}),
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Error al guardar')
      }
      if (etapa !== lead.etapa_venta) onEtapaChange(lead.id, etapa)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleRenombrar = async () => {
    const nombre = nuevoNombre.trim()
    if (!nombre || !lead.cliente?.id) return
    setSavingNombre(true)
    await supabase.from('clientes')
      .update({ nombre, nombre_pendiente_aprobacion: false })
      .eq('id', lead.cliente.id)
    onLeadUpdate?.(lead.id, { nombre, nombre_pendiente_aprobacion: false })
    setEditandoNombre(false)
    setSavingNombre(false)
  }

  const handleEliminar = async () => {
    if (!lead.cliente?.id) return
    setDeleting(true)
    await supabase.from('clientes').delete().eq('id', lead.cliente.id)
    onLeadDelete?.(lead.id)
    onClose()
  }

  const etapaActual = ETAPA_MAP[etapa]

  return (
    <>
    {vincularOpen && lead.cliente && (
      <VincularClienteModal
        tenantId={tenantId}
        clienteOrigenId={lead.cliente.id}
        clienteOrigenNombre={lead.cliente.nombre ?? 'Sin nombre'}
        onConfirm={(_nuevoId, nuevoNombre) => {
          setVincularOpen(false)
          alert(`✅ Vinculado a "${nuevoNombre}". Para desvincular entra al perfil del cliente. Recargando...`)
          window.location.reload()
        }}
        onCancel={() => setVincularOpen(false)}
      />
    )}
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden">

        {/* Modal confirmar eliminación */}
        {confirmDelete && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 rounded-2xl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 mx-4">
              <h2 className="font-bold text-red-700 mb-1">⚠️ Eliminar cliente</h2>
              <p className="text-sm text-gray-600 mb-3">
                Esto eliminará permanentemente a <strong>{lead.cliente?.nombre ?? 'este cliente'}</strong> y todos sus datos. Esta acción no se puede deshacer.
              </p>
              <p className="text-xs text-gray-500 mb-1.5">Para confirmar, escribe <span className="font-bold text-red-600">ELIMINAR</span> en el campo:</p>
              <input
                autoFocus
                value={confirmDeleteInput}
                onChange={e => setConfirmDeleteInput(e.target.value)}
                placeholder="Escribe ELIMINAR"
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
              />
              <div className="flex gap-2">
                <button onClick={() => { setConfirmDelete(false); setConfirmDeleteInput('') }} disabled={deleting}
                  className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                  Cancelar
                </button>
                <button onClick={handleEliminar} disabled={deleting || confirmDeleteInput !== 'ELIMINAR'}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {editandoNombre ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={nuevoNombre}
                  onChange={e => setNuevoNombre(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenombrar(); if (e.key === 'Escape') setEditandoNombre(false) }}
                  className="border border-blue-400 rounded-lg px-2.5 py-1 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
                />
                <button onClick={handleRenombrar} disabled={savingNombre}
                  className="px-2.5 py-1 bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40">
                  {savingNombre ? '...' : 'OK'}
                </button>
                <button onClick={() => setEditandoNombre(false)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-bold text-gray-900">{lead.cliente?.nombre ?? 'Sin nombre'}</p>
                {esGerencia && (
                  <button onClick={() => { setNuevoNombre(lead.cliente?.nombre ?? ''); setEditandoNombre(true) }}
                    className="text-gray-300 hover:text-blue-500 transition-colors" title="Editar nombre">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold text-white flex-shrink-0"
              style={{ background: etapaActual.color }}>
              {etapaActual.label}
            </span>
            {lead.cliente?.celular && (
              <span className="text-xs text-gray-400 flex-shrink-0">{lead.cliente.celular}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {profile?.rol === 'gerencia' && (
              <button onClick={() => { setConfirmDeleteInput(''); setConfirmDelete(true) }}
                className="text-xs text-red-400 hover:text-red-600 font-medium px-2 py-1 hover:bg-red-50 rounded-lg transition-colors">
                🗑 Eliminar
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">

          {/* ── Chat (45%) ── */}
          <div className="w-[45%] flex flex-col border-r">

            {lead.todas_conversaciones.length > 0 && (
              <div className="flex border-b bg-gray-50 px-2 pt-1.5 gap-0.5 flex-shrink-0 overflow-x-auto">
                {lead.todas_conversaciones.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setConvActivaId(c.id)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-colors border-b-2 whitespace-nowrap ${
                      convActivaId === c.id
                        ? 'bg-white border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <span>{CANAL_ICON[c.canal] ?? '💭'}</span>
                    <span>{CANAL_LABEL[c.canal] ?? c.canal}</span>
                    {c.no_leidos_count > 0 && (
                      <span className="bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
                        {c.no_leidos_count > 9 ? '9+' : c.no_leidos_count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {lead.todas_conversaciones.length === 0 && (
              <div className="flex-1 flex items-center justify-center bg-gray-50">
                <p className="text-sm text-gray-400 text-center px-6">
                  Este cliente no tiene chat en ningún canal todavía.<br />
                  El seguimiento se está haciendo en persona / por teléfono.
                </p>
              </div>
            )}

            {lead.todas_conversaciones.length > 0 && (
              <>
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

                <div className="border-t bg-white">
                  <div className="flex border-b">
                    <button onClick={() => setTipoMsg('mensaje')}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                        tipoMsg === 'mensaje' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                      💬 Mensaje al cliente
                    </button>
                    <button onClick={() => setTipoMsg('nota')}
                      className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                        tipoMsg === 'nota' ? 'bg-yellow-50 text-yellow-700 border-b-2 border-yellow-500' : 'text-gray-500 hover:text-gray-700'
                      }`}>
                      📝 Nota interna
                    </button>
                  </div>
                  <div className="px-3 py-2 flex gap-2">
                    <textarea
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                      placeholder={tipoMsg === 'nota' ? 'Escribe una nota interna...' : 'Escribe un mensaje al cliente... (Enter para enviar)'}
                      rows={3}
                      className={`flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${
                        tipoMsg === 'nota' ? 'border-yellow-200 bg-yellow-50 focus:ring-yellow-400' : 'border-gray-200 focus:ring-blue-500'
                      }`}
                    />
                    <button onClick={enviar} disabled={!input.trim() || sending}
                      className={`w-9 h-9 self-end rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                        tipoMsg === 'nota' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}>
                      {sending
                        ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Panel derecho (55%) ── */}
          <div className="w-[55%] flex flex-col min-h-0">
            <div className="flex border-b flex-shrink-0 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTabDer(t.id)}
                  className={`flex-shrink-0 px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    tabDer === t.id ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {t.icon} {t.label}
                </button>
              ))}
              {esGerencia && (
                <button onClick={() => setTabDer('visibilidad')}
                  className={`flex-shrink-0 px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    tabDer === 'visibilidad' ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  🔒 Visibilidad
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">

              {tabDer === 'resumen' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cliente</p>
                    <p className="font-semibold text-gray-900">{lead.cliente?.nombre ?? '—'}</p>
                    {lead.cliente?.celular && <p className="text-sm text-gray-600">{lead.cliente.celular}</p>}
                    {lead.lead_source && <p className="text-xs text-gray-400 mt-1">Origen: {lead.lead_source}</p>}
                    {lead.cliente?.id && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <a href={`/admin/clientes/${lead.cliente.id}`} className="text-xs text-blue-600 hover:underline">
                          Ver perfil completo →
                        </a>
                        <button onClick={() => setVincularOpen(true)} className="text-xs text-purple-600 hover:underline">
                          🔗 Vincular a otro cliente
                        </button>
                      </div>
                    )}
                  </div>

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
                        <label className="text-xs text-gray-500">Asignado a</label>
                        {esGerencia ? (
                          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5">
                            <option value="">Sin asignar</option>
                            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                          </select>
                        ) : (
                          <p className="text-sm text-gray-700 mt-0.5">
                            {usuarios.find(u => u.id === assignedTo)?.nombre ?? 'Sin asignar'}
                            <span className="text-xs text-gray-400 ml-1">(solo Gerencia puede cambiarlo)</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <button onClick={guardarVenta} disabled={saving}
                    className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>

                  <ResumenTab
                    clienteId={lead.id}
                    tenantId={tenantId}
                    usuarioId={profile?.id ?? ''}
                    onProximaAccionChange={(proxAccion, proxFecha) => onLeadUpdate?.(lead.id, { proxima_accion: proxAccion, proxima_accion_fecha: proxFecha })}
                  />

                  {ordenes.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Historial de servicio técnico ({ordenes.length})
                      </p>
                      {ordenes.map(o => (
                        <div key={o.id} className="bg-blue-50 rounded-lg px-3 py-2 mb-1.5">
                          <p className="text-xs font-semibold text-blue-800">{formatDate(o.created_at)} · {o.estado}</p>
                          {o.descripcion_problema && <p className="text-xs text-blue-600 truncate">{o.descripcion_problema}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {lead.todas_conversaciones.length > 0 && (
                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Canales activos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {lead.todas_conversaciones.map(c => (
                          <span key={c.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-medium">
                            {CANAL_ICON[c.canal] ?? '💭'} {CANAL_LABEL[c.canal] ?? c.canal}
                            {c.no_leidos_count > 0 && (
                              <span className="bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">
                                {c.no_leidos_count > 9 ? '9+' : c.no_leidos_count}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tabDer === 'datos'      && <DatosClienteTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'motos'      && <MotosInteresTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'cotizacion' && <CotizacionTab clienteId={lead.id} tenantId={tenantId} clienteNombre={lead.cliente?.nombre ?? ''} clienteCelular={lead.cliente?.celular ?? ''} />}
              {tabDer === 'pago'          && <PagoTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'archivos'      && <ArchivosTab clienteId={lead.id} />}
              {tabDer === 'comentarios'   && <ComentariosTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'pasos'         && <PasosTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
              {tabDer === 'recordatorios' && <RecordatoriosTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} clienteEmail={clienteEmail} onProximaAccionChange={(proxAccion, proxFecha) => onLeadUpdate?.(lead.id, { proxima_accion: proxAccion, proxima_accion_fecha: proxFecha })} />}
              {tabDer === 'historial'     && <HistorialTab clienteId={lead.id} />}
              {tabDer === 'visibilidad' && esGerencia && <VisibilidadTab clienteId={lead.id} tenantId={tenantId} usuarioId={profile?.id ?? ''} />}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}
