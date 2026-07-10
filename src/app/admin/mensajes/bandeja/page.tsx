'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import SeguimientoModal from '@/components/SeguimientoModal'

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
  clientes: { id: string; nombre: string | null }[] | null
}

type Mensaje = {
  id: string
  conversacion_id: string
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

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  if (d.length === 11) return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,5)}) ${d.slice(5,8)}-${d.slice(8)}`
  if (d.length === 13) return `+${d.slice(0,3)} (${d.slice(3,5)}) ${d.slice(5,9)}-${d.slice(9)}`
  return raw
}

function formatDuracion(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0 && m > 0) return `${h} h ${m} min`
  if (h > 0) return `${h} h`
  return `${Math.max(m, 1)} min`
}

// PostgREST may return the embedded join as an object (many-to-one) or array —
// normalize to always have an array so the rest of the code works uniformly.
function normalizeClientes(raw: unknown): { id: string; nombre: string | null }[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as { id: string; nombre: string | null }[]
  if (typeof raw === 'object') return [raw as { id: string; nombre: string | null }]
  return []
}

function getDisplayName(conv: Conversacion): string {
  if (conv.clientes?.[0]?.nombre) return conv.clientes[0].nombre!
  if (conv.canal === 'whatsapp') return formatPhone(conv.canal_contact_id)
  if (conv.canal === 'messenger') return `Messenger ···${conv.canal_contact_id.slice(-4)}`
  if (conv.canal === 'instagram') return `Instagram ···${conv.canal_contact_id.slice(-4)}`
  return conv.canal_contact_id
}

const CANAL_META: Record<string, { icon: string; cls: string; label: string; color: string }> = {
  whatsapp:  { icon: '📱', cls: 'bg-green-100 text-green-700',  label: 'WhatsApp',  color: 'bg-green-500'  },
  messenger: { icon: '💬', cls: 'bg-blue-100 text-blue-700',    label: 'Messenger', color: 'bg-blue-500'   },
  instagram: { icon: '📸', cls: 'bg-pink-100 text-pink-700',    label: 'Instagram', color: 'bg-pink-500'   },
  manual:    { icon: '✏️', cls: 'bg-gray-100 text-gray-600',    label: 'Manual',    color: 'bg-gray-400'   },
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

  const [convs, setConvs]             = useState<Conversacion[]>([])
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [mensajes, setMensajes]       = useState<Mensaje[]>([])
  const [equipo, setEquipo]           = useState<Usuario[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs]   = useState(false)
  const [sending, setSending]         = useState(false)
  const [input, setInput]             = useState('')
  const [esNota, setEsNota]           = useState(false)
  const [filterMias, setFilterMias]   = useState(false)
  const [filterCanal, setFilterCanal] = useState('todos')
  const [filterEstado, setFilterEstado] = useState('activas')
  const [search, setSearch]           = useState('')
  const [toastMsg, setToastMsg]       = useState<{ text: string; ok: boolean } | null>(null)

  // Panel de info del contacto
  const [showInfo, setShowInfo]       = useState(false)
  const [editNombre, setEditNombre]   = useState('')
  const [savingNombre, setSavingNombre] = useState(false)

  // Modal agregar a seguimiento
  const [seguimientoOpen, setSeguimientoOpen] = useState(false)

  // Eliminar conversación
  const [confirmDeleteConv, setConfirmDeleteConv]   = useState(false)
  const [confirmDeleteConvInput, setConfirmDeleteConvInput] = useState('')
  const [deletingConv, setDeletingConv]             = useState(false)

  // Ventana de 24 h
  const [ventanaActiva, setVentanaActiva]     = useState<boolean | null>(null)
  const [ventanaExpiraAt, setVentanaExpiraAt] = useState<number | null>(null)
  const [tickAhora, setTickAhora]             = useState(0)

  const messagesEndRef       = useRef<HTMLDivElement>(null)
  const inputRef             = useRef<HTMLTextAreaElement>(null)
  const convsPrevRef         = useRef<Conversacion[]>([])
  // Ref para que el callback de Realtime siempre tenga el valor actual sin re-suscribir
  const selectedIdRef        = useRef<string | null>(null)
  // Evitar múltiples intentos de sync en la misma sesión
  const messengerSyncedRef   = useRef(false)
  const instagramSyncedRef   = useRef(false)

  const toast = useCallback((text: string, ok = true) => {
    setToastMsg({ text, ok })
    setTimeout(() => setToastMsg(null), 3000)
  }, [])

  // Mantener el ref sincronizado con el estado
  selectedIdRef.current = selectedId

  const selectedConv = convs.find(c => c.id === selectedId) ?? null
  const usuariosMap  = Object.fromEntries(equipo.map(u => [u.id, u.nombre]))

  // ── Notificaciones del navegador ──────────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const notificar = useCallback((convId: string, texto: string) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const conv = convsPrevRef.current.find(c => c.id === convId)
    const nombre = conv ? getDisplayName(conv) : 'Nuevo mensaje'
    const canal  = conv ? (CANAL_META[conv.canal]?.label ?? 'Mensaje') : 'Mensaje'
    const n = new Notification(`OptiDesk — ${nombre}`, {
      body: `[${canal}] ${texto || 'Nuevo mensaje'}`,
      icon: '/icons/icon-192.png',
      tag:  convId,
    })
    n.onclick = () => { window.focus(); setSelectedId(convId) }
  }, [])

  // ── Cargar datos ──────────────────────────────────────────────────────────
  const cargarEquipo = useCallback(async () => {
    if (!profile?.tenant_id) return
    const { data } = await supabase.from('usuarios').select('id, nombre').eq('tenant_id', profile.tenant_id)
    setEquipo((data as Usuario[]) ?? [])
  }, [profile?.tenant_id])

  const cargarConversaciones = useCallback(async (silent = false) => {
    if (!profile?.tenant_id) return
    if (!silent) setLoadingConvs(true)
    let q = supabase
      .from('conversaciones')
      .select('id, canal, canal_contact_id, estado, prioridad, no_leidos_count, ultimo_mensaje_at, ultimo_mensaje_texto, ultimo_mensaje_direccion, assigned_to, cliente_id, clientes(id, nombre)')
      .eq('tenant_id', profile.tenant_id)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
      .limit(100)

    if (filterEstado === 'activas') q = q.in('estado', ['abierta', 'pendiente'])
    else if (filterEstado !== 'todas') q = q.eq('estado', filterEstado)
    if (filterCanal !== 'todos') q = q.eq('canal', filterCanal)
    if (filterMias && profile.id) q = q.eq('assigned_to', profile.id)

    const { data } = await q
    // Normalize clientes: PostgREST returns object for many-to-one joins, but we need arrays
    const nuevas: Conversacion[] = ((data ?? []) as (Omit<Conversacion, 'clientes'> & { clientes: unknown })[])
      .map(c => ({ ...c, clientes: normalizeClientes(c.clientes) }))

    // Detectar mensajes nuevos para notificación
    if (convsPrevRef.current.length > 0) {
      for (const conv of nuevas) {
        const prev = convsPrevRef.current.find(c => c.id === conv.id)
        if (
          conv.ultimo_mensaje_direccion === 'entrante' &&
          conv.no_leidos_count > 0 &&
          conv.id !== selectedId &&
          (!prev || prev.ultimo_mensaje_at !== conv.ultimo_mensaje_at)
        ) {
          if (document.hidden || !document.hasFocus()) {
            notificar(conv.id, conv.ultimo_mensaje_texto ?? '')
          }
        }
      }
    }
    convsPrevRef.current = nuevas
    // Preservar clientes (nombre) que ya teníamos en estado local si el join devuelve vacío
    setConvs(prev => nuevas.map(c => {
      const old = prev.find(p => p.id === c.id)
      return { ...c, clientes: c.clientes?.length ? c.clientes : old?.clientes ?? [] }
    }))
    setLoadingConvs(false)
  }, [profile?.tenant_id, profile?.id, filterEstado, filterCanal, filterMias, selectedId, notificar])

  const cargarMensajes = useCallback(async (id: string) => {
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('mensajes')
      .select('id, conversacion_id, direccion, tipo, contenido, enviado_por, estado_envio, created_at, leido_por_asesor')
      .eq('conversacion_id', id)
      .order('created_at', { ascending: true })
      .limit(200)
    setMensajes((data as Mensaje[]) ?? [])
    setLoadingMsgs(false)
    await supabase.from('conversaciones').update({ no_leidos_count: 0 }).eq('id', id)
    setConvs(cs => cs.map(c => c.id === id ? { ...c, no_leidos_count: 0 } : c))
  }, [])

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.tenant_id) return

    // Canal 1: cambios en conversaciones (filter por tenant)
    const chConvs = supabase
      .channel(`convs-${profile.tenant_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'conversaciones',
        filter: `tenant_id=eq.${profile.tenant_id}`,
      }, () => { cargarConversaciones(true) })
      .subscribe()

    // Canal 2: INSERT y UPDATE en mensajes — sin filtro, filtramos client-side
    const chMsgs = supabase
      .channel(`msgs-tenant-${profile.tenant_id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes',
      }, (payload) => {
        const msg = payload.new as Mensaje
        const activo = selectedIdRef.current
        if (msg.conversacion_id === activo) {
          setMensajes(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          supabase.from('conversaciones').update({ no_leidos_count: 0 }).eq('id', activo)
          setConvs(cs => cs.map(c => c.id === activo ? { ...c, no_leidos_count: 0 } : c))
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'mensajes',
      }, (payload) => {
        // Actualizar el estado_envio (ticks) en tiempo real
        const updated = payload.new as Mensaje
        if (updated.conversacion_id === selectedIdRef.current) {
          setMensajes(prev => prev.map(m => m.id === updated.id ? { ...m, estado_envio: updated.estado_envio } : m))
        }
      })
      .subscribe()

    // Fallback polling lento (30s) si Realtime no está habilitado en el proyecto
    const fallback = setInterval(() => cargarConversaciones(true), 30000)

    return () => {
      supabase.removeChannel(chConvs)
      supabase.removeChannel(chMsgs)
      clearInterval(fallback)
    }
  }, [profile?.tenant_id, cargarConversaciones])

  // ── Efectos de carga ──────────────────────────────────────────────────────
  useEffect(() => { cargarEquipo() }, [cargarEquipo])
  useEffect(() => { cargarConversaciones() }, [cargarConversaciones])
  useEffect(() => {
    if (selectedId) { cargarMensajes(selectedId); setShowInfo(false) }
    else setMensajes([])
  }, [selectedId, cargarMensajes])
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  // Auto-sync nombres de Messenger: corre una vez por sesión cuando detecta convs sin nombre
  useEffect(() => {
    if (messengerSyncedRef.current) return
    if (loadingConvs) return
    const sinNombre = convs.some(c => c.canal === 'messenger' && !c.clientes?.[0]?.nombre)
    if (!sinNombre) return
    messengerSyncedRef.current = true
    fetch('/api/admin/mensajes/sync-messenger-names', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.updated > 0) cargarConversaciones(true)
        else messengerSyncedRef.current = false
      })
      .catch(() => { messengerSyncedRef.current = false })
  }, [convs, loadingConvs, cargarConversaciones])

  // Auto-sync nombres de Instagram: igual que Messenger
  useEffect(() => {
    if (instagramSyncedRef.current) return
    if (loadingConvs) return
    const sinNombre = convs.some(c => c.canal === 'instagram' && !c.clientes?.[0]?.nombre)
    if (!sinNombre) return
    instagramSyncedRef.current = true
    fetch('/api/admin/mensajes/sync-instagram-names', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.updated > 0) cargarConversaciones(true)
        else instagramSyncedRef.current = false
      })
      .catch(() => { instagramSyncedRef.current = false })
  }, [convs, loadingConvs, cargarConversaciones])

  // Cuando cambia selectedConv, pre-cargar nombre en el editor
  useEffect(() => {
    setEditNombre(selectedConv?.clientes?.[0]?.nombre ?? '')
    setVentanaActiva(null) // reset mientras cargan mensajes
  }, [selectedConv?.id])

  // Ticker de 1 minuto para actualizar el tiempo restante de ventana
  // (se inicializa en useEffect para evitar hydration mismatch con Date.now())
  useEffect(() => {
    setTickAhora(Date.now())
    const t = setInterval(() => setTickAhora(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Calcular ventana de 24 h para WhatsApp, Messenger e Instagram
  useEffect(() => {
    if (!selectedConv || !['whatsapp', 'messenger', 'instagram'].includes(selectedConv.canal)) {
      setVentanaActiva(null); setVentanaExpiraAt(null); return
    }
    if (loadingMsgs) return
    const last = [...mensajes].reverse().find(m => m.direccion === 'entrante')
    if (last) {
      const expira = new Date(last.created_at).getTime() + 86_400_000
      setVentanaActiva(expira > Date.now())
      setVentanaExpiraAt(expira)
    } else {
      setVentanaActiva(false)
      setVentanaExpiraAt(null)
    }
  }, [mensajes, selectedConv?.id, selectedConv?.canal, loadingMsgs])

  // ── Guardar nombre del contacto ───────────────────────────────────────────
  const guardarNombre = async () => {
    if (!selectedConv || !editNombre.trim()) return
    setSavingNombre(true)
    try {
      const res  = await fetch('/api/admin/mensajes/guardar-contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: selectedConv.id, nombre: editNombre.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al guardar')
      const { cliente_id, nombre } = json as { cliente_id: string; nombre: string }
      setConvs(cs => cs.map(c => c.id === selectedConv.id
        ? { ...c, cliente_id, clientes: [{ id: cliente_id, nombre }] }
        : c))
      toast('Nombre guardado')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al guardar', false)
    } finally { setSavingNombre(false) }
  }

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  const enviar = async () => {
    const texto = input.trim()
    if (!texto || !selectedId || sending) return
    setSending(true); setInput('')
    const tempMsg: Mensaje = {
      id: `temp-${Date.now()}`, conversacion_id: selectedId,
      direccion: 'saliente', tipo: esNota ? 'nota_interna' : 'texto',
      contenido: texto, enviado_por: profile?.id ?? null,
      estado_envio: 'pendiente', created_at: new Date().toISOString(), leido_por_asesor: true,
    }
    setMensajes(prev => [...prev, tempMsg])
    try {
      const res  = await fetch('/api/admin/mensajes/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: selectedId, contenido: texto, tipo: esNota ? 'nota_interna' : 'texto' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const real = json.mensaje as Mensaje
      setMensajes(prev => {
        // Quitar el temp; si Realtime ya agregó el real, no duplicar
        const sinTemp = prev.filter(m => m.id !== tempMsg.id)
        return sinTemp.some(m => m.id === real.id) ? sinTemp : [...sinTemp, real]
      })
    } catch (e: unknown) {
      setMensajes(prev => prev.filter(m => m.id !== tempMsg.id))
      toast(e instanceof Error ? e.message : 'Error al enviar', false)
      setInput(texto)
    } finally { setSending(false); inputRef.current?.focus() }
  }

  const cambiarEstado = async (id: string, estado: string) => {
    await supabase.from('conversaciones').update({ estado, updated_at: new Date().toISOString() }).eq('id', id)
    setConvs(cs => cs.map(c => c.id === id ? { ...c, estado: estado as Conversacion['estado'] } : c))
  }

  const reasignar = async (id: string, userId: string) => {
    await supabase.from('conversaciones').update({ assigned_to: userId || null, updated_at: new Date().toISOString() }).eq('id', id)
    setConvs(cs => cs.map(c => c.id === id ? { ...c, assigned_to: userId || null } : c))
  }

  const eliminarConversacion = async () => {
    if (!selectedId) return
    setDeletingConv(true)
    await supabase.from('mensajes').delete().eq('conversacion_id', selectedId)
    await supabase.from('conversaciones').delete().eq('id', selectedId)
    setConvs(cs => cs.filter(c => c.id !== selectedId))
    setSelectedId(null)
    setMensajes([])
    setConfirmDeleteConv(false)
    setConfirmDeleteConvInput('')
    setDeletingConv(false)
    toast('Conversación eliminada')
  }

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

      {/* Modal eliminar conversación */}
      {confirmDeleteConv && selectedConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <h2 className="font-bold text-red-700 mb-1">⚠️ Eliminar conversación</h2>
            <p className="text-sm text-gray-600 mb-3">
              Se eliminarán permanentemente <strong>todos los mensajes del chat</strong> con <strong>{getDisplayName(selectedConv)}</strong>. Se perderán los datos del historial de esta conversación y no se podrán recuperar.
            </p>
            <p className="text-xs text-gray-500 mb-1.5">Para confirmar, escribe <span className="font-bold text-red-600">ELIMINAR</span> en el campo:</p>
            <input
              autoFocus
              value={confirmDeleteConvInput}
              onChange={e => setConfirmDeleteConvInput(e.target.value)}
              placeholder="Escribe ELIMINAR"
              className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => { setConfirmDeleteConv(false); setConfirmDeleteConvInput('') }} disabled={deletingConv}
                className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
                Cancelar
              </button>
              <button onClick={eliminarConversacion} disabled={deletingConv || confirmDeleteConvInput !== 'ELIMINAR'}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                {deletingConv ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista de conversaciones ──────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-gray-900">Bandeja</h1>
            <span className="text-xs text-gray-400">{convsFiltradas.length} conv.</span>
          </div>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..." className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-1 flex-wrap">
            {['activas', 'todas', 'resuelta'].map(e => (
              <button key={e} onClick={() => setFilterEstado(e)}
                className={`px-2 py-0.5 rounded-full text-xs transition-colors ${filterEstado === e ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {e === 'activas' ? 'Activas' : e === 'todas' ? 'Todas' : 'Resueltas'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            {['todos', 'whatsapp', 'messenger', 'instagram'].map(c => (
              <button key={c} onClick={() => setFilterCanal(c)}
                className={`px-2 py-0.5 rounded-full text-xs transition-colors ${filterCanal === c ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {c === 'todos' ? 'Todos' : CANAL_META[c]?.label}
              </button>
            ))}
            <button onClick={() => setFilterMias(!filterMias)}
              className={`px-2 py-0.5 rounded-full text-xs transition-colors ${filterMias ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Solo mías
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loadingConvs ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : convsFiltradas.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">{search ? 'Sin resultados' : 'Sin conversaciones'}</div>
          ) : convsFiltradas.map(conv => {
            const cm = CANAL_META[conv.canal] ?? CANAL_META.manual
            const isSelected = conv.id === selectedId
            return (
              <div key={conv.id}
                className={`relative group w-full text-left px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-blue-600' : ''}`}
                onClick={() => setSelectedId(conv.id)}
              >
                <div className="flex items-start gap-2.5">
                  <div className="relative flex-shrink-0">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${cm.cls}`}>{cm.icon}</span>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${cm.color}`} title={cm.label} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-sm text-gray-900 truncate">{getDisplayName(conv)}</span>
                      <span className="flex-shrink-0 text-xs text-gray-400">{timeAgo(conv.ultimo_mensaje_at)}</span>
                    </div>
                    {conv.clientes?.[0]?.nombre && conv.canal === 'whatsapp' && (
                      <p className="text-xs text-gray-400 truncate leading-tight">
                        {formatPhone(conv.canal_contact_id)}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-1 mt-0.5">
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
                      <span className={`inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded-full ${ESTADO_COLORS[conv.estado]}`}>{conv.estado}</span>
                    )}
                  </div>
                </div>
                {/* Botón eliminar — solo Gerencia, visible siempre en la tarjeta seleccionada */}
                {profile?.rol === 'gerencia' && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      setSelectedId(conv.id)
                      setConfirmDeleteConvInput('')
                      setConfirmDeleteConv(true)
                    }}
                    title="Eliminar conversación"
                    className={`absolute top-2 right-2 p-1 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            )
          })}
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
          <p className="text-sm text-gray-400">Elige una conversación de la lista</p>
        </div>
      ) : (
        <div className="flex-1 flex min-w-0">

          {/* ── Área de chat ────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <div className="relative flex-shrink-0">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-base ${CANAL_META[selectedConv.canal]?.cls}`}>
                  {CANAL_META[selectedConv.canal]?.icon}
                </span>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${CANAL_META[selectedConv.canal]?.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-gray-900 truncate">{getDisplayName(selectedConv)}</p>
                  <button onClick={() => setShowInfo(!showInfo)} title="Editar contacto"
                    className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${CANAL_META[selectedConv.canal]?.cls}`}>
                    {CANAL_META[selectedConv.canal]?.icon} {CANAL_META[selectedConv.canal]?.label}
                  </span>
                  <span className="text-xs text-gray-400 select-none">
                    {selectedConv.canal === 'whatsapp' ? formatPhone(selectedConv.canal_contact_id) : selectedConv.canal_contact_id}
                  </span>
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                <select value={selectedConv.assigned_to ?? ''} onChange={e => reasignar(selectedConv.id, e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-36">
                  <option value="">Sin asignar</option>
                  {equipo.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
                <select value={selectedConv.estado} onChange={e => cambiarEstado(selectedConv.id, e.target.value)}
                  className={`text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium ${ESTADO_COLORS[selectedConv.estado]}`}>
                  <option value="abierta">Abierta</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="resuelta">Resuelta</option>
                  <option value="archivada">Archivar</option>
                </select>
              </div>
            </div>

            {/* Barra de acciones — solo Gerencia */}
            {profile?.rol === 'gerencia' && (
              <div className="bg-white border-b border-gray-100 px-4 py-1.5 flex items-center justify-end flex-shrink-0">
                <button
                  onClick={() => { setConfirmDeleteConvInput(''); setConfirmDeleteConv(true) }}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-400"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Eliminar chat
                </button>
              </div>
            )}

            {/* Banner nombre Instagram/Messenger sin nombre */}
            {(selectedConv.canal === 'instagram' || selectedConv.canal === 'messenger') && !selectedConv.clientes?.[0]?.nombre && (
              <div className="bg-pink-50 border-b border-pink-100 px-4 py-2 flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-pink-600 flex-shrink-0">¿Cómo se llama?</span>
                <input
                  value={editNombre}
                  onChange={e => setEditNombre(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && guardarNombre()}
                  placeholder="Escribe el nombre del contacto..."
                  className="flex-1 text-xs border border-pink-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
                />
                <button
                  onClick={guardarNombre}
                  disabled={savingNombre || !editNombre.trim()}
                  className="flex-shrink-0 px-3 py-1 bg-pink-500 hover:bg-pink-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                >
                  {savingNombre ? '...' : 'Guardar'}
                </button>
              </div>
            )}

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {loadingMsgs ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : mensajes.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-8">No hay mensajes aún</div>
              ) : mensajes.map((msg, i) => {
                const isOut  = msg.direccion === 'saliente'
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
                          <span className="font-semibold not-italic">📝 Nota: </span>{msg.contenido}
                          <span className="ml-2 text-yellow-500 not-italic">{formatTime(msg.created_at)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} mb-0.5`}>
                        <div className={`max-w-xs lg:max-w-sm rounded-2xl px-3.5 py-2 shadow-sm ${isOut ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm'}`}>
                          {!isOut && msg.enviado_por && (
                            <p className="text-xs font-semibold text-blue-600 mb-0.5">{usuariosMap[msg.enviado_por] ?? 'Sistema'}</p>
                          )}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.contenido}</p>
                          <div className={`flex items-center justify-end gap-1 mt-0.5 ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>
                            <span className="text-xs">{formatTime(msg.created_at)}</span>
                            {isOut && (
                              <span className="text-xs">
                                {msg.estado_envio === 'leido'
                                  ? <span className="text-sky-300 font-bold">✓✓</span>
                                  : msg.estado_envio === 'entregado'
                                    ? <span className="opacity-70">✓✓</span>
                                    : msg.estado_envio === 'enviado'
                                      ? <span className="opacity-60">✓</span>
                                      : msg.estado_envio === 'fallido'
                                        ? <span className="text-red-300">✗</span>
                                        : <span className="opacity-50">⏳</span>
                                }
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className={`bg-white border-t border-gray-200 p-3 flex-shrink-0 ${esNota ? 'bg-yellow-50' : ''}`}>
              {/* Banner ventana cerrada — WhatsApp */}
              {selectedConv?.canal === 'whatsapp' && !esNota && ventanaActiva === false && (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2 text-xs text-amber-800">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="flex-shrink-0">⚠️</span>
                    <span className="truncate">Ventana cerrada — el contacto no ha escrito en 24 h. Solo puedes enviar una plantilla aprobada.</span>
                  </div>
                  <a href="/admin/mensajes/plantillas" className="flex-shrink-0 text-blue-700 font-semibold hover:underline whitespace-nowrap">
                    Ver plantillas →
                  </a>
                </div>
              )}
              {/* Banner ventana cerrada — Messenger */}
              {selectedConv?.canal === 'messenger' && !esNota && ventanaActiva === false && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-2 text-xs text-blue-800">
                  <span className="flex-shrink-0">🔒</span>
                  <span>Ventana de Messenger cerrada — el contacto no ha escrito en las últimas 24 h. Responder fuera de ese plazo requiere aprobación de Meta (App Review).</span>
                </div>
              )}
              {/* Banner ventana cerrada — Instagram */}
              {selectedConv?.canal === 'instagram' && !esNota && ventanaActiva === false && (
                <div className="flex items-center gap-2 bg-pink-50 border border-pink-200 rounded-xl px-3 py-2 mb-2 text-xs text-pink-800">
                  <span className="flex-shrink-0">🔒</span>
                  <span>Ventana de Instagram cerrada — el contacto no ha escrito en las últimas 24 h. Se requiere Acceso Avanzado a <strong>instagram_manage_messages</strong> (App Review) para responder.</span>
                </div>
              )}
              {/* Ventana activa — WhatsApp / Messenger / Instagram */}
              {['whatsapp', 'messenger', 'instagram'].includes(selectedConv?.canal ?? '') && !esNota && ventanaActiva === true && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 mb-1.5 px-0.5">
                  <span>✓</span>
                  <span>
                    Ventana activa
                    {ventanaExpiraAt && ` — cierra en ${formatDuracion(ventanaExpiraAt - tickAhora)}`}
                  </span>
                </div>
              )}
              {esNota && <div className="text-xs text-yellow-700 font-medium mb-1.5 px-1">📝 Nota interna — no se envía al cliente</div>}
              <div className="flex items-end gap-2">
                {(() => {
                  const ventanaCerrada = !esNota && ventanaActiva === false && ['whatsapp', 'messenger', 'instagram'].includes(selectedConv?.canal ?? '')
                  const placeholder = ventanaCerrada
                    ? selectedConv?.canal === 'whatsapp'
                      ? 'Ventana cerrada — usa una plantilla para contactar'
                      : 'Ventana cerrada — no puedes responder hasta que el contacto escriba'
                    : esNota
                      ? 'Escribe una nota interna...'
                      : 'Escribe un mensaje... (Enter para enviar)'
                  return (
                    <>
                      <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                        placeholder={placeholder}
                        rows={2}
                        disabled={ventanaCerrada}
                        className={`flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed ${esNota ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`}
                      />
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button onClick={() => setEsNota(!esNota)} title="Nota interna"
                          className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors ${esNota ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          📝
                        </button>
                        <button onClick={enviar} disabled={!input.trim() || sending || ventanaCerrada}
                          className="w-9 h-9 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 transition-colors">
                          {sending
                            ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                          }
                        </button>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* ── Panel de info del contacto ───────────────────────────── */}
          {showInfo && (
            <div className="w-64 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <p className="font-semibold text-sm text-gray-900">Info del contacto</p>
                <button onClick={() => setShowInfo(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 space-y-4">
                {/* Canal */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Canal</p>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${CANAL_META[selectedConv.canal]?.cls}`}>
                    {CANAL_META[selectedConv.canal]?.icon} {CANAL_META[selectedConv.canal]?.label}
                  </span>
                </div>
                {/* Contacto */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Número / ID</p>
                  <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2 py-1.5">
                    <p className="text-sm font-mono text-gray-700 flex-1 select-none">
                      {selectedConv.canal === 'whatsapp'
                        ? formatPhone(selectedConv.canal_contact_id)
                        : selectedConv.canal_contact_id}
                    </p>
                    <button
                      onClick={() => navigator.clipboard.writeText(selectedConv.canal_contact_id)}
                      title="Copiar número"
                      className="text-gray-400 hover:text-gray-700 flex-shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Nombre */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Nombre del contacto</p>
                  <input
                    value={editNombre}
                    onChange={e => setEditNombre(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && guardarNombre()}
                    placeholder="Ej: Juan Pérez"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={guardarNombre}
                    disabled={savingNombre || editNombre.trim() === (selectedConv.clientes?.[0]?.nombre ?? '')}
                    className="mt-1.5 w-full py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                  >
                    {savingNombre ? 'Guardando...' : 'Guardar nombre'}
                  </button>
                </div>
                {/* Estado */}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Estado</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[selectedConv.estado]}`}>
                    {selectedConv.estado}
                  </span>
                </div>

                {/* Seguimiento de Ventas */}
                <div className="pt-1 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">Seguimiento de Ventas</p>
                  <button
                    onClick={() => setSeguimientoOpen(true)}
                    className="w-full py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-semibold transition-colors">
                    + Agregar / Vincular a Seguimiento
                  </button>
                </div>
              </div>
            </div>
          )}

          {seguimientoOpen && selectedConv && (
            <SeguimientoModal
              nombreInicial={selectedConv.clientes?.[0]?.nombre ?? editNombre}
              celularInicial={selectedConv.canal === 'whatsapp' ? selectedConv.canal_contact_id : ''}
              onSuccess={(_id, nombre) => {
                setSeguimientoOpen(false)
                toast(`✅ ${nombre || 'Cliente'} agregado a Seguimiento de Ventas`)
              }}
              onClose={() => setSeguimientoOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
