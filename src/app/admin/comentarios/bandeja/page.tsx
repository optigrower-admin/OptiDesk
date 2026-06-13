'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

type Publicacion = {
  id: string
  canal: 'facebook' | 'instagram'
  publicacion_id: string
  caption: string | null
  media_url: string | null
  media_type: string | null
  permalink: string | null
  comentarios_count: number
  nuevos_comentarios: number
  created_at: string
}

type Comentario = {
  id: string
  publicacion_id: string
  canal: 'facebook' | 'instagram'
  comentario_id: string
  texto: string | null
  autor_id: string | null
  autor_nombre: string | null
  autor_username: string | null
  autor_foto: string | null
  estado: 'nuevo' | 'visto' | 'respondido' | 'dm_enviado'
  conversacion_id: string | null
  created_at: string
}

type Toast = { msg: string; ok: boolean; convId?: string }

const CANAL_COLOR: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-700 border-blue-200',
  instagram: 'bg-pink-100 text-pink-700 border-pink-200',
}
const CANAL_LABEL: Record<string, string> = { facebook: 'FB', instagram: 'IG' }

const ESTADO_MAP: Record<string, [string, string]> = {
  nuevo:       ['bg-red-100 text-red-700',    'Nuevo'],
  visto:       ['bg-gray-100 text-gray-600',  'Visto'],
  respondido:  ['bg-green-100 text-green-700','Respondido'],
  dm_enviado:  ['bg-purple-100 text-purple-700','DM enviado'],
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000

  if (diff < 60)   return 'ahora'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function initials(nombre: string | null, username: string | null): string {
  const src = nombre ?? username ?? '?'
  return src.replace('@', '').charAt(0).toUpperCase()
}

function PubCard({ pub, selected, onClick }: { pub: Publicacion; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border-b transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
    >
      <div className="flex gap-2.5">
        {pub.media_url ? (
          <img
            src={pub.media_url}
            alt=""
            className="w-12 h-12 object-cover rounded-lg flex-shrink-0 bg-gray-100"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className={`w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-xl ${pub.canal === 'facebook' ? 'bg-blue-50' : 'bg-pink-50'}`}>
            {pub.canal === 'facebook' ? '📘' : '📸'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${CANAL_COLOR[pub.canal]}`}>
              {CANAL_LABEL[pub.canal]}
            </span>
            {pub.nuevos_comentarios > 0 && (
              <span className="bg-red-500 text-white rounded-full text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                {pub.nuevos_comentarios > 99 ? '99+' : pub.nuevos_comentarios}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed">
            {pub.caption || '(sin descripción)'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">
            {pub.comentarios_count} comentario{pub.comentarios_count !== 1 ? 's' : ''} · {formatDate(pub.created_at)}
          </p>
        </div>
      </div>
    </button>
  )
}

export default function ComentariosBandejaPage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useAuth()

  const [publicaciones, setPublicaciones] = useState<Publicacion[]>([])
  const [selectedPub, setSelectedPub]     = useState<Publicacion | null>(null)
  const [comentarios, setComentarios]     = useState<Comentario[]>([])
  const [filtro, setFiltro]               = useState<'todos' | 'facebook' | 'instagram'>('todos')
  const [syncing, setSyncing]             = useState(false)
  const [loadingPubs, setLoadingPubs]     = useState(true)
  const [loadingComments, setLoadingComments] = useState(false)

  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText]   = useState('')
  const [sendingReply, setSendingReply] = useState<string | null>(null)

  // DM modal state
  const [dmTo, setDmTo]       = useState<Comentario | null>(null)
  const [dmText, setDmText]   = useState('')
  const [sendingDm, setSendingDm] = useState(false)

  const [toast, setToast]          = useState<Toast | null>(null)
  const [lastSynced, setLastSynced]  = useState<Date | null>(null)
  const [pubsError, setPubsError]    = useState<string | null>(null)
  const toastRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtroRef     = useRef(filtro)
  const selectedPubRef = useRef<Publicacion | null>(null)

  // Keep refs fresh so the interval always reads the latest values
  useEffect(() => { filtroRef.current = filtro }, [filtro])
  useEffect(() => { selectedPubRef.current = selectedPub }, [selectedPub])

  const showToast = (t: Toast) => {
    if (toastRef.current) clearTimeout(toastRef.current)
    setToast(t)
    toastRef.current = setTimeout(() => setToast(null), 5000)
  }

  const cargarPublicaciones = useCallback(async () => {
    setLoadingPubs(true)
    setPubsError(null)
    try {
      const url = filtro === 'todos'
        ? '/api/admin/comentarios/publicaciones'
        : `/api/admin/comentarios/publicaciones?canal=${filtro}`
      const res  = await fetch(url)
      const data = await res.json()
      if (res.ok) {
        setPublicaciones(data)
      } else {
        setPubsError(`Error ${res.status}: ${data?.error ?? 'desconocido'}`)
      }
    } catch (e) {
      setPubsError(`Error de conexión: ${String(e)}`)
    } finally {
      setLoadingPubs(false)
    }
  }, [filtro])

  const cargarComentarios = useCallback(async (pubId: string) => {
    setLoadingComments(true)
    setComentarios([])
    try {
      const res = await fetch(`/api/admin/comentarios/comentarios?publicacion_id=${pubId}`)
      if (res.ok) setComentarios(await res.json())
    } finally {
      setLoadingComments(false)
    }
  }, [])

  useEffect(() => { cargarPublicaciones() }, [cargarPublicaciones])

  // Auto-sync: on mount + every 10 minutes, silently in background
  useEffect(() => {
    const silentSync = async () => {
      try {
        await fetch('/api/admin/comentarios/sync', { method: 'POST' })
        setLastSynced(new Date())
        // Reload publications respecting current filter
        const url = filtroRef.current !== 'todos'
          ? `/api/admin/comentarios/publicaciones?canal=${filtroRef.current}`
          : '/api/admin/comentarios/publicaciones'
        const res = await fetch(url)
        if (res.ok) setPublicaciones(await res.json())
        // Reload comments for selected publication if any
        const pub = selectedPubRef.current
        if (pub) {
          const cr = await fetch(`/api/admin/comentarios/comentarios?publicacion_id=${pub.id}`)
          if (cr.ok) setComentarios(await cr.json())
        }
      } catch { /* ignore */ }
    }

    silentSync()
    const id = setInterval(silentSync, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: nuevo comentario llega vía webhook → aparece al instante
  useEffect(() => {
    if (!profile?.tenant_id) return

    const ch = supabase
      .channel(`bandeja-comentarios-${profile.tenant_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comentarios',
        filter: `tenant_id=eq.${profile.tenant_id}`,
      }, (payload) => {
        const nuevo = payload.new as Comentario & { publicacion_id: string }

        // Si la publicación activa es la que recibió el comentario → agrega al instante
        if (selectedPubRef.current?.id === nuevo.publicacion_id) {
          setComentarios(prev => {
            const existe = prev.some(c => c.id === nuevo.id || c.comentario_id === nuevo.comentario_id)
            return existe ? prev : [...prev, nuevo]
          })
        }

        // Actualiza contadores de la publicación afectada sin recargar todo
        setPublicaciones(prev => prev.map(p =>
          p.id === nuevo.publicacion_id
            ? {
                ...p,
                comentarios_count:  p.comentarios_count + 1,
                nuevos_comentarios: p.nuevos_comentarios + (nuevo.estado === 'nuevo' ? 1 : 0),
              }
            : p
        ))
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id])

  const handleSelectPub = (pub: Publicacion) => {
    setSelectedPub(pub)
    setReplyingTo(null)
    setReplyText('')
    cargarComentarios(pub.id)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res  = await fetch('/api/admin/comentarios/sync', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; facebook_posts?: number; facebook_comments?: number; instagram_posts?: number; instagram_comments?: number; error?: string }
      if (res.ok && data.ok) {
        const fbCom = data.facebook_comments ?? 0
        const igCom = data.instagram_comments ?? 0
        showToast({ ok: true, msg: `Sincronizado: ${data.facebook_posts ?? 0} posts FB (${fbCom} com.) · ${data.instagram_posts ?? 0} posts IG (${igCom} com.)` })
        await cargarPublicaciones()
        if (selectedPub) await cargarComentarios(selectedPub.id)
      } else {
        showToast({ ok: false, msg: data.error ?? 'Error al sincronizar' })
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleMarcarVisto = async (c: Comentario) => {
    if (c.estado !== 'nuevo') return
    const res = await fetch(`/api/admin/comentarios/comentarios/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'visto' }),
    })
    if (res.ok) {
      setComentarios(prev => prev.map(x => x.id === c.id ? { ...x, estado: 'visto' } : x))
      setPublicaciones(prev => prev.map(p =>
        p.id === c.publicacion_id
          ? { ...p, nuevos_comentarios: Math.max(0, p.nuevos_comentarios - 1) }
          : p
      ))
    }
  }

  const handleResponder = async (c: Comentario) => {
    if (!replyText.trim()) return
    setSendingReply(c.id)
    try {
      const res = await fetch('/api/admin/comentarios/responder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario_id: c.id, texto: replyText }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (res.ok && data.ok) {
        setComentarios(prev => prev.map(x => x.id === c.id ? { ...x, estado: 'respondido' } : x))
        if (c.estado === 'nuevo') {
          setPublicaciones(prev => prev.map(p =>
            p.id === c.publicacion_id
              ? { ...p, nuevos_comentarios: Math.max(0, p.nuevos_comentarios - 1) }
              : p
          ))
        }
        setReplyingTo(null)
        setReplyText('')
        showToast({ ok: true, msg: 'Respuesta publicada' })
      } else {
        showToast({ ok: false, msg: data.error ?? 'Error al responder' })
      }
    } finally {
      setSendingReply(null)
    }
  }

  const handleEnviarDM = async () => {
    if (!dmTo || !dmText.trim()) return
    setSendingDm(true)
    try {
      const res = await fetch('/api/admin/comentarios/crear-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario_id: dmTo.id, mensaje: dmText }),
      })
      const data = await res.json() as { ok?: boolean; conversacion_id?: string; error?: string }
      if (res.ok && data.ok) {
        setComentarios(prev => prev.map(x => x.id === dmTo.id ? { ...x, estado: 'dm_enviado', conversacion_id: data.conversacion_id ?? null } : x))
        if (dmTo.estado === 'nuevo') {
          setPublicaciones(prev => prev.map(p =>
            p.id === dmTo.publicacion_id
              ? { ...p, nuevos_comentarios: Math.max(0, p.nuevos_comentarios - 1) }
              : p
          ))
        }
        setDmTo(null)
        setDmText('')
        showToast({ ok: true, msg: 'DM enviado', convId: data.conversacion_id })
      } else {
        showToast({ ok: false, msg: data.error ?? 'Error al enviar DM' })
      }
    } finally {
      setSendingDm(false)
    }
  }

  const pubs = filtro === 'todos' ? publicaciones : publicaciones.filter(p => p.canal === filtro)

  return (
    <div className="flex h-screen bg-gray-50">

      {/* ── Left panel ───────────────────────────────────────────────────────── */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h1 className="font-bold text-gray-900 text-base">Comentarios</h1>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115 0M20 15a9 9 0 01-15 0" />
              </svg>
              {syncing ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          </div>
          {lastSynced && (
            <p className="text-[10px] text-gray-400 mb-2">
              Auto-sync activo · última vez {lastSynced.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          {/* Canal filter tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {(['todos', 'facebook', 'instagram'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${filtro === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {f === 'todos' ? 'Todos' : f === 'facebook' ? 'FB' : 'IG'}
              </button>
            ))}
          </div>
        </div>

        {/* Publications list */}
        <div className="flex-1 overflow-y-auto">
          {loadingPubs ? (
            <div className="p-8 text-center text-gray-400 text-sm">Cargando…</div>
          ) : pubsError ? (
            <div className="p-6 text-center">
              <p className="text-red-500 text-xs font-semibold mb-1">Error al cargar</p>
              <p className="text-red-400 text-xs break-words">{pubsError}</p>
            </div>
          ) : pubs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-400 text-sm mb-2">Sin publicaciones aún</p>
              <p className="text-gray-300 text-xs">Haz clic en Sincronizar para traer los posts</p>
            </div>
          ) : (
            pubs.map(pub => (
              <PubCard
                key={pub.id}
                pub={pub}
                selected={selectedPub?.id === pub.id}
                onClick={() => handleSelectPub(pub)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedPub ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4">💬</div>
              <p className="text-gray-500 text-sm font-medium">Selecciona una publicación</p>
              <p className="text-gray-400 text-xs mt-1">para ver sus comentarios</p>
            </div>
          </div>
        ) : (
          <>
            {/* Publication header */}
            <div className="bg-white border-b border-gray-200 p-4 flex items-start gap-3 flex-shrink-0">
              {selectedPub.media_url && (
                <img
                  src={selectedPub.media_url}
                  alt=""
                  className="w-14 h-14 object-cover rounded-xl flex-shrink-0 bg-gray-100"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${CANAL_COLOR[selectedPub.canal]}`}>
                    {selectedPub.canal === 'facebook' ? '📘 Facebook' : '📸 Instagram'}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(selectedPub.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 line-clamp-2 leading-relaxed">
                  {selectedPub.caption || '(sin descripción)'}
                </p>
                {selectedPub.permalink && (
                  <a
                    href={selectedPub.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                  >
                    Ver publicación →
                  </a>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-400">{selectedPub.comentarios_count} comentarios</p>
              </div>
            </div>

            {/* Comments area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingComments ? (
                <div className="text-center text-gray-400 text-sm py-8">Cargando comentarios…</div>
              ) : comentarios.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">
                  <p>Sin comentarios aún</p>
                  <p className="text-xs mt-1 text-gray-300">Los comentarios aparecen luego de sincronizar</p>
                </div>
              ) : (
                comentarios.map(c => {
                  const [estadoCls, estadoLabel] = ESTADO_MAP[c.estado] ?? ESTADO_MAP.nuevo
                  const displayName = c.autor_nombre ?? (c.autor_username ? `@${c.autor_username}` : 'Usuario')
                  const isReplying = replyingTo === c.id

                  return (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                      {/* Comment body */}
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold ${c.canal === 'facebook' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                          {initials(c.autor_nombre, c.autor_username)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-gray-900">{displayName}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${estadoCls}`}>
                              {estadoLabel}
                            </span>
                            <span className="text-[10px] text-gray-400 ml-auto">{formatDate(c.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-700 break-words leading-relaxed">{c.texto ?? '(sin texto)'}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-gray-50">
                        <button
                          onClick={() => { setReplyingTo(isReplying ? null : c.id); setReplyText('') }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                        >
                          {isReplying ? 'Cancelar' : '↩ Responder públicamente'}
                        </button>
                        {c.estado !== 'dm_enviado' && (
                          <button
                            onClick={() => { setDmTo(c); setDmText('') }}
                            className="text-xs text-purple-600 hover:text-purple-800 font-medium transition-colors"
                          >
                            ✉ Enviar DM
                          </button>
                        )}
                        {c.conversacion_id && (
                          <button
                            onClick={() => router.push('/admin/mensajes/bandeja')}
                            className="text-xs text-green-600 hover:text-green-800 font-medium transition-colors"
                          >
                            → Ver conversación
                          </button>
                        )}
                        {c.estado === 'nuevo' && (
                          <button
                            onClick={() => handleMarcarVisto(c)}
                            className="text-xs text-gray-400 hover:text-gray-600 ml-auto transition-colors"
                          >
                            Marcar visto
                          </button>
                        )}
                      </div>

                      {/* Inline reply form */}
                      {isReplying && (
                        <div className="mt-2.5 flex gap-2">
                          <input
                            type="text"
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleResponder(c) } }}
                            placeholder={`Responder a ${displayName}…`}
                            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                            autoFocus
                          />
                          <button
                            onClick={() => handleResponder(c)}
                            disabled={!replyText.trim() || sendingReply === c.id}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            {sendingReply === c.id ? '…' : 'Publicar'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── DM Modal ─────────────────────────────────────────────────────────── */}
      {dmTo && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => !sendingDm && setDmTo(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-96 mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${dmTo.canal === 'facebook' ? 'bg-blue-100 text-blue-600' : 'bg-pink-100 text-pink-600'}`}>
                {initials(dmTo.autor_nombre, dmTo.autor_username)}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  Enviar DM a {dmTo.autor_nombre ?? dmTo.autor_username ?? 'usuario'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  vía {dmTo.canal === 'facebook' ? 'Messenger' : 'Instagram DM'}
                </p>
              </div>
            </div>

            {dmTo.texto && (
              <div className="bg-gray-50 rounded-lg p-2.5 mb-4 text-xs text-gray-600 italic">
                &ldquo;{dmTo.texto}&rdquo;
              </div>
            )}

            <textarea
              value={dmText}
              onChange={e => setDmText(e.target.value)}
              placeholder="Escribe el mensaje privado…"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
              autoFocus
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setDmTo(null)}
                disabled={sendingDm}
                className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 rounded-xl text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEnviarDM}
                disabled={sendingDm || !dmText.trim()}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {sendingDm ? 'Enviando…' : 'Enviar DM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl text-sm text-white shadow-xl flex items-center gap-2 max-w-xs ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          <span className="flex-1">{toast.msg}</span>
          {toast.ok && toast.convId && (
            <button
              onClick={() => { setToast(null); router.push('/admin/mensajes/bandeja') }}
              className="text-white underline text-xs font-semibold flex-shrink-0"
            >
              Ver →
            </button>
          )}
          <button onClick={() => setToast(null)} className="text-white/70 hover:text-white flex-shrink-0">✕</button>
        </div>
      )}
    </div>
  )
}
