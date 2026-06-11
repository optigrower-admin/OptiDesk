'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Conversacion = {
  id: string
  canal: 'whatsapp' | 'messenger' | 'instagram' | 'manual'
  canal_contact_id: string
  estado: 'abierta' | 'pendiente' | 'resuelta' | 'archivada'
  prioridad: 'normal' | 'importante' | 'urgente'
  no_leidos_count: number
  ultimo_mensaje_at: string | null
  ultimo_mensaje_texto: string | null
  ultimo_mensaje_direccion: string | null
  assigned_to: string | null
  cliente_id: string | null
  clientes: { nombre: string | null } | null
}

type Mensaje = {
  id: string
  direccion: 'entrante' | 'saliente'
  tipo: string
  contenido: string | null
  enviado_por: string | null
  estado_envio: string
  created_at: string
  leido_por_asesor: boolean
}

type Usuario = { id: string; nombre: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function getDisplayName(conv: Conversacion): string {
  if (conv.clientes?.nombre) return conv.clientes.nombre
  if (conv.canal === 'whatsapp') return conv.canal_contact_id
  if (conv.canal === 'messenger') return `Messenger ···${conv.canal_contact_id.slice(-4)}`
  if (conv.canal === 'instagram') return `Instagram ···${conv.canal_contact_id.slice(-4)}`
  return conv.canal_contact_id
}

const CANAL_META: Record<string, { icon: string; cls: string; label: string }> = {
  whatsapp:  { icon: '📱', cls: 'bg-green-100 text-green-700',  label: 'WhatsApp'  },
  messenger: { icon: '💬', cls: 'bg-blue-100 text-blue-700',    label: 'Messenger' },
  instagram: { icon: '📸', cls: 'bg-pink-100 text-pink-700',    label: 'Instagram' },
  manual:    { icon: '✏️', cls: 'bg-gray-100 text-gray-600',    label: 'Manual'    },
}

const ESTADO_COLORS: Record<string, string> = {
  abierta:   'bg-green-100 text-green-700',
  pendiente: 'bg-yellow-100 text-yellow-700',
  resuelta:  'bg-gray-100 text-gray-500',
  archivada: 'bg-gray-50 text-gray-400',
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function BandejaPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [convs, setConvs]           = useState<Conversacion[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mensajes, setMensajes]     = useState<Mensaje[]>([])
  const [equipo, setEquipo]         = useState<Usuario[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs]   = useState(false)
  const [sending, setSending]       = useState(false)
  const [input, setInput]           = useState('')
  const [esNota, setEsNota]         = useState(false)
  const [filterMias, setFilterMias] = useState(false)
  const [filterCanal, setFilterCanal] = useState('todos')
  const [filterEstado, setFilterEstado] = useState('activas')
  const [search, setSearch]         = useState('')
  const [toastMsg, setToastMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  const toast = (text: string, ok = true) => {
    setToastMsg({ text, ok })
    setTimeout(() => setToastMsg(null), 3000)
  }

  const selectedConv = convs.find(c => c.id === selectedId) ?? null
  const usuariosMap = Object.fromEntries(equipo.map(u => [u.id, u.nombre]))

  // ── Cargar equipo ─────────────────────────────────────────────────────────
  const cargarEquipo = useCallback(async () => {
    if (!profile?.tenant_id) return
    const { data } = await supabase
      .from('usuarios').select('id, nombre').eq('tenant_id', profile.tenant_id)
    setEquipo((data as Usuario[]) ?? [])
  }, [profile?.tenant_id])

  // ── Cargar conversaciones ─────────────────────────────────────────────────
  const cargarConversaciones = useCallback(async () => {
    if (!profile?.tenant_id) return
    let q = supabase
      .from('conversaciones')
      .select('id, canal, canal_contact_id, estado, prioridad, no_leidos_count, ultimo_mensaje_at, ultimo_mensaje_texto, ultimo_mensaje_direccion, assigned_to, cliente_id, clientes(nombre)')
      .eq('tenant_id', profile.tenant_id)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
      .limit(100)

    if (filterEstado === 'activas') {
      q = q.in('estado', ['abierta', 'pendiente'])
    } else if (filterEstado !== 'todas') {
      q = q.eq('estado', filterEstado)
    }
    if (filterCanal !== 'todos') q = q.eq('canal', filterCanal)
    if (filterMias && profile.id) q = q.eq('assigned_to', profile.id)

    const { data } = await q
    setConvs((data as Conversacion[]) ?? [])
    setLoadingConvs(false)
  }, [profile?.tenant_id, profile?.id, filterEstado, filterCanal, filterMias])

  // ── Cargar mensajes ───────────────────────────────────────────────────────
  const cargarMensajes = useCallback(async (id: string) => {
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('mensajes')
      .select('id, direccion, tipo, contenido, enviado_por, estado_envio, created_at, leido_por_asesor')
      .eq('conversacion_id', id)
      .order('created_at', { ascending: true })
      .limit(200)
    setMensajes((data as Mensaje[]) ?? [])
    setLoadingMsgs(false)

    // Marcar como leídos
    await supabase.from('conversaciones').update({ no_leidos_count: 0 }).eq('id', id)
    setConvs(cs => cs.map(c => c.id === id ? { ...c, no_leidos_count: 0 } : c))
  }, [])

  // ── Efectos ───────────────────────────────────────────────────────────────
  useEffect(() => { cargarEquipo() }, [cargarEquipo])
  useEffect(() => { cargarConversaciones() }, [cargarConversaciones])

  useEffect(() => {
    if (selectedId) cargarMensajes(selectedId)
    else setMensajes([])
  }, [selectedId, cargarMensajes])

  // Scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // Polling: conversaciones cada 8s, mensajes cada 4s cuando está abierto
  useEffect(() => {
    const t1 = setInterval(() => cargarConversaciones(), 8000)
    return () => clearInterval(t1)
  }, [cargarConversaciones])

  useEffect(() => {
    if (!selectedId) return
    const t = setInterval(() => cargarMensajes(selectedId), 4000)
    return () => clearInterval(t)
  }, [selectedId, cargarMensajes])

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  const enviar = async () => {
    const texto = input.trim()
    if (!texto || !selectedId || sending) return
    setSending(true)
    setInput('')

    // Optimistic update
    const tempMsg: Mensaje = {
      id: `temp-${Date.now()}`,
      direccion: 'saliente',
      tipo: esNota ? 'nota_interna' : 'texto',
      contenido: texto,
      enviado_por: profile?.id ?? null,
      estado_envio: 'pendiente',
      created_at: new Date().toISOString(),
      leido_por_asesor: true,
    }
    setMensajes(prev => [...prev, tempMsg])

    try {
      const res = await fetch('/api/admin/mensajes/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: selectedId, contenido: texto, tipo: esNota ? 'nota_interna' : 'texto' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // Replace temp with real message
      setMensajes(prev => prev.map(m => m.id === tempMsg.id ? json.mensaje : m))
      await cargarConversaciones()
    } catch (e: unknown) {
      setMensajes(prev => prev.filter(m => m.id !== tempMsg.id))
      toast(e instanceof Error ? e.message : 'Error al enviar', false)
      setInput(texto) // Restore input
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  // ── Cambiar estado conversación ───────────────────────────────────────────
  const cambiarEstado = async (id: string, estado: string) => {
    await supabase.from('conversaciones').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    setConvs(cs => cs.map(c => c.id === id ? { ...c, estado: estado as Conversacion['estado'] } : c))
  }

  // ── Reasignar ─────────────────────────────────────────────────────────────
  const reasignar = async (id: string, userId: string) => {
    await supabase.from('conversaciones').update({ assigned_to: userId || null, updated_at: new Date().toISOString() }).eq('id', id)
    setConvs(cs => cs.map(c => c.id === id ? { ...c, assigned_to: userId || null } : c))
  }

  // ── Filtrar lista ─────────────────────────────────────────────────────────
  const convsFiltradas = convs.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return getDisplayName(c).toLowerCase().includes(q) || (c.ultimo_mensaje_texto ?? '').toLowerCase().includes(q)
  })

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full">
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMsg.text}
        </div>
      )}

      {/* ── Lista de conversaciones ──────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        {/* Cabecera */}
        <div className="p-4 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-gray-900">Bandeja</h1>
            <span className="text-xs text-gray-400">{convsFiltradas.length} conv.</span>
          </div>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {/* Filtros */}
          <div className="flex gap-1 flex-wrap">
            {['activas', 'todas', 'resuelta'].map(e => (
              <button
                key={e}
                onClick={() => setFilterEstado(e)}
                className={`px-2 py-0.5 rounded-full text-xs transition-colors ${filterEstado === e ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {e === 'activas' ? 'Activas' : e === 'todas' ? 'Todas' : 'Resueltas'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            {['todos', 'whatsapp', 'messenger', 'instagram'].map(c => (
              <button
                key={c}
                onClick={() => setFilterCanal(c)}
                className={`px-2 py-0.5 rounded-full text-xs transition-colors ${filterCanal === c ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {c === 'todos' ? 'Todos' : CANAL_META[c]?.label}
              </button>
            ))}
            <button
              onClick={() => setFilterMias(!filterMias)}
              className={`px-2 py-0.5 rounded-full text-xs transition-colors ${filterMias ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Solo mías
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loadingConvs ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : convsFiltradas.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">
              {search ? 'Sin resultados' : 'Sin conversaciones'}
            </div>
          ) : (
            convsFiltradas.map(conv => {
              const cm = CANAL_META[conv.canal] ?? CANAL_META.manual
              const isSelected = conv.id === selectedId
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-blue-600' : ''}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${cm.cls}`}>
                      {cm.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-medium text-sm text-gray-900 truncate">{getDisplayName(conv)}</span>
                        <span className="flex-shrink-0 text-xs text-gray-400">{timeAgo(conv.ultimo_mensaje_at)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs text-gray-500 truncate">
                          {conv.ultimo_mensaje_direccion === 'saliente' && <span className="text-blue-500">Tú: </span>}
                          {conv.ultimo_mensaje_texto ?? 'Sin mensajes'}
                        </p>
                        {conv.no_leidos_count > 0 && (
                          <span className="flex-shrink-0 w-4 h-4 bg-green-500 text-white rounded-full text-xs flex items-center justify-center font-bold">
                            {conv.no_leidos_count > 9 ? '9+' : conv.no_leidos_count}
                          </span>
                        )}
                      </div>
                      {conv.estado !== 'abierta' && (
                        <span className={`inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded-full ${ESTADO_COLORS[conv.estado]}`}>
                          {conv.estado}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Panel derecho ────────────────────────────────────────────────── */}
      {!selectedConv ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center bg-gray-50 p-8">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-700 mb-1">Selecciona una conversación</h3>
          <p className="text-sm text-gray-400">Elige una conversación de la lista para ver los mensajes</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
          {/* Header conversación */}
          <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 flex-shrink-0">
            <span className={`w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 ${CANAL_META[selectedConv.canal]?.cls}`}>
              {CANAL_META[selectedConv.canal]?.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{getDisplayName(selectedConv)}</p>
              <p className="text-xs text-gray-500">{CANAL_META[selectedConv.canal]?.label} · {selectedConv.canal_contact_id}</p>
            </div>
            {/* Asignado a */}
            <select
              value={selectedConv.assigned_to ?? ''}
              onChange={e => reasignar(selectedConv.id, e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-36"
            >
              <option value="">Sin asignar</option>
              {equipo.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            {/* Estado */}
            <select
              value={selectedConv.estado}
              onChange={e => cambiarEstado(selectedConv.id, e.target.value)}
              className={`text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium ${ESTADO_COLORS[selectedConv.estado]}`}
            >
              <option value="abierta">Abierta</option>
              <option value="pendiente">Pendiente</option>
              <option value="resuelta">Resuelta</option>
              <option value="archivada">Archivar</option>
            </select>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {loadingMsgs ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mensajes.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-8">No hay mensajes aún</div>
            ) : (
              mensajes.map((msg, i) => {
                const isOut = msg.direccion === 'saliente'
                const isNota = msg.tipo === 'nota_interna'
                const showDate = i === 0 || new Date(msg.created_at).toDateString() !== new Date(mensajes[i-1].created_at).toDateString()

                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="text-center my-3">
                        <span className="text-xs bg-gray-200 text-gray-500 px-3 py-1 rounded-full">
                          {new Date(msg.created_at).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                      </div>
                    )}
                    {isNota ? (
                      <div className="flex justify-center my-1">
                        <div className="max-w-sm bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800 italic">
                          <span className="font-semibold not-italic">📝 Nota: </span>
                          {msg.contenido}
                          <span className="ml-2 text-yellow-500 not-italic">{formatTime(msg.created_at)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-0.5`}>
                        <div className={`max-w-xs lg:max-w-sm rounded-2xl px-3.5 py-2 shadow-sm ${
                          isOut
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white text-gray-900 rounded-bl-sm'
                        }`}>
                          {!isOut && msg.enviado_por && (
                            <p className="text-xs font-semibold text-blue-600 mb-0.5">{usuariosMap[msg.enviado_por] ?? 'Sistema'}</p>
                          )}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.contenido}</p>
                          <div className={`flex items-center justify-end gap-1 mt-0.5 ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>
                            <span className="text-xs">{formatTime(msg.created_at)}</span>
                            {isOut && (
                              <span className="text-xs">
                                {msg.estado_envio === 'leido' ? '✓✓' : msg.estado_envio === 'entregado' ? '✓✓' : msg.estado_envio === 'enviado' ? '✓' : msg.estado_envio === 'fallido' ? '✗' : '⏳'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className={`bg-white border-t border-gray-200 p-3 flex-shrink-0 ${esNota ? 'bg-yellow-50' : ''}`}>
            {esNota && (
              <div className="text-xs text-yellow-700 font-medium mb-1.5 px-1">
                📝 Modo nota interna — no se envía al cliente
              </div>
            )}
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  placeholder={esNota ? 'Escribe una nota interna...' : 'Escribe un mensaje... (Enter para enviar)'}
                  rows={2}
                  className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${esNota ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`}
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setEsNota(!esNota)}
                  title="Nota interna"
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors ${esNota ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  📝
                </button>
                <button
                  onClick={enviar}
                  disabled={!input.trim() || sending}
                  className="w-9 h-9 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {sending ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
