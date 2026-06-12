'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

type ConfigMeta = {
  meta_app_id?: string | null
  wa_phone_number?: string | null
  wa_phone_number_id?: string | null
  wa_business_account_id?: string | null
  wa_access_token_enc?: string | null
  messenger_page_id?: string | null
  instagram_account_id?: string | null
  meta_webhook_verify_token?: string | null
  negocio_verificado?: boolean
  estado_wa?: string | null
  estado_messenger?: string | null
  estado_instagram?: string | null
  limite_diario_wa?: number | null
  mensajes_iniciados_hoy?: number | null
}

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID

// ── Scopes por canal ──────────────────────────────────────────────────────────
const SCOPES = {
  whatsapp:  'whatsapp_business_management,whatsapp_business_messaging',
  messenger: 'pages_show_list,pages_messaging',
  instagram: 'pages_show_list,instagram_basic,instagram_manage_messages',
}

const CALLBACKS = {
  whatsapp:  'https://opti-desk.vercel.app/api/admin/mensajes/oauth-callback',
  messenger: 'https://opti-desk.vercel.app/api/admin/mensajes/messenger-callback',
  instagram: 'https://opti-desk.vercel.app/api/admin/mensajes/instagram-callback',
}

function Badge({ estado }: { estado?: string | null }) {
  const map: Record<string, [string, string]> = {
    conectado:    ['bg-green-100 text-green-800', 'Conectado'],
    conectando:   ['bg-yellow-100 text-yellow-800', 'Conectando'],
    error:        ['bg-red-100 text-red-800', 'Error'],
    desconectado: ['bg-gray-100 text-gray-500', 'Desconectado'],
  }
  const [cls, label] = map[estado ?? 'desconectado'] ?? map.desconectado
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

function Toast({ msg, ok, onDone }: { msg: string; ok: boolean; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg max-w-xs ${ok ? 'bg-green-600' : 'bg-red-600'}`}>
      {msg}
    </div>
  )
}

// ── Componente de canal ───────────────────────────────────────────────────────

type ChannelCardProps = {
  icon:        React.ReactNode
  name:        string
  color:       string
  estado?:     string | null
  detail?:     string | null
  onConnect:   () => void
  onDisconnect?: () => void
  connecting:  boolean
  disabled?:   boolean
  disabledMsg?: string
  extra?:      React.ReactNode
}

function ChannelCard({ icon, name, color, estado, detail, onConnect, onDisconnect, connecting, disabled, disabledMsg, extra }: ChannelCardProps) {
  const connected = estado === 'conectado'
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{name}</p>
            {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
          </div>
        </div>
        <Badge estado={estado} />
      </div>

      {extra}

      {disabled ? (
        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700 leading-relaxed">{disabledMsg}</p>
        </div>
      ) : (
        <div className="flex gap-2 mt-3">
          <button
            onClick={onConnect}
            disabled={connecting}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              connected
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                : 'bg-blue-700 hover:bg-blue-800 text-white'
            } disabled:opacity-50`}
          >
            {connecting ? 'Conectando...' : connected ? 'Reconectar' : 'Conectar'}
          </button>
          {connected && onDisconnect && (
            <button
              onClick={onDisconnect}
              className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold transition-colors"
            >
              Desconectar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ConexionMetaPage() {
  const { profile } = useAuth()
  const [config,   setConfig]   = useState<ConfigMeta | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState<{ text: string; ok: boolean } | null>(null)
  const [busy,     setBusy]     = useState<Record<string, boolean>>({})
  const [showManual, setShowManual] = useState(false)

  const isGerencia = ['gerencia', 'admin', 'control_total'].includes(profile?.rol ?? '')

  const showToast = useCallback((text: string, ok = true) => setToast({ text, ok }), [])

  const suscribirWebhook = async () => {
    setBusy(b => ({ ...b, suscribir: true }))
    try {
      const res  = await fetch('/api/admin/mensajes/suscribir-webhook', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast('Webhook suscrito — los mensajes deberían llegar ahora')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Error al suscribir webhook', false)
    } finally { setBusy(b => ({ ...b, suscribir: false })) }
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/admin/mensajes/config')
    const json = await res.json()
    setConfig(json.config ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Abrir popup OAuth para un canal
  const conectar = (canal: 'whatsapp' | 'messenger' | 'instagram') => {
    const scope       = SCOPES[canal]
    const redirectUri = encodeURIComponent(CALLBACKS[canal])
    const url = `https://www.facebook.com/dialog/oauth?client_id=${APP_ID}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`

    const w = 580, h = 680
    const left = Math.round(window.screenX + (window.outerWidth  - w) / 2)
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2)
    const popup = window.open(url, `meta_${canal}`, `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`)

    setBusy(b => ({ ...b, [canal]: true }))

    let checkClosed: ReturnType<typeof setInterval>

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'META_OAUTH_COMPLETE') return
      const { success, error, detail, phone } = event.data
      window.removeEventListener('message', onMessage)
      clearInterval(checkClosed)
      setBusy(b => ({ ...b, [canal]: false }))
      if (success) {
        const label = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram' }[canal]
        showToast(`${label} conectado${detail || phone ? `: ${detail || phone}` : ''}`)
        cargar()
      } else {
        const msgs: Record<string, string> = {
          sin_waba:      'No se encontró cuenta de WhatsApp Business.',
          sin_numeros:   'No hay números en tu WABA.',
          sin_paginas:   'No se encontraron páginas de Facebook.',
          sin_instagram: 'No hay Instagram profesional vinculado a tus páginas.',
          no_code:       'No se recibió autorización.',
          oauth_denied:  'Acceso denegado. Intenta de nuevo.',
          token_error:   'Error al obtener el token de Meta.',
        }
        showToast(msgs[error] ?? `Error al conectar (${error ?? 'desconocido'})`, false)
      }
    }

    window.addEventListener('message', onMessage)
    checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        window.removeEventListener('message', onMessage)
        setBusy(b => ({ ...b, [canal]: false }))
      }
    }, 500)
  }

  const toggleVerificado = async () => {
    const nuevo = !config?.negocio_verificado
    setConfig(c => c ? { ...c, negocio_verificado: nuevo } : c)
    try {
      const res = await fetch('/api/admin/mensajes/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ negocio_verificado: nuevo }),
      })
      if (!res.ok) throw new Error()
      showToast(nuevo ? 'Marcado como negocio verificado' : 'Marcado como no verificado')
    } catch {
      setConfig(c => c ? { ...c, negocio_verificado: !nuevo } : c)
      showToast('Error al actualizar', false)
    }
  }

  const desconectarCanal = async (canal: 'whatsapp' | 'messenger' | 'instagram') => {
    const campos: Record<string, Record<string, string | null>> = {
      whatsapp:  { wa_access_token_enc: null, estado_wa: 'desconectado' },
      messenger: { messenger_access_token_enc: null, messenger_page_id: null, estado_messenger: 'desconectado' },
      instagram: { instagram_access_token_enc: null, instagram_account_id: null, estado_instagram: 'desconectado' },
    }
    setBusy(b => ({ ...b, [canal]: true }))
    try {
      await fetch('/api/admin/mensajes/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campos[canal]),
      })
      showToast('Canal desconectado')
      cargar()
    } catch { showToast('Error al desconectar', false) }
    finally { setBusy(b => ({ ...b, [canal]: false })) }
  }

  if (loading) return (
    <div className="p-8 flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // Cuentas no verificadas: Meta limita a 250 conversaciones/día iniciadas por el negocio
  const limiteDiario = config?.negocio_verificado ? (config?.limite_diario_wa ?? 1000) : 250
  const pct = Math.min(Math.round(((config?.mensajes_iniciados_hoy ?? 0) / limiteDiario) * 100), 100)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {toast && <Toast msg={toast.text} ok={toast.ok} onDone={() => setToast(null)} />}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Canales de mensajería</h1>
        <p className="text-sm text-gray-500 mt-0.5">Conecta y gestiona cada canal de forma independiente</p>
      </div>

      <div className="space-y-4">

        {/* ── WhatsApp ─────────────────────────────────────────────── */}
        <ChannelCard
          icon={
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-700" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.49"/>
            </svg>
          }
          name="WhatsApp Business"
          color="bg-green-100"
          estado={config?.estado_wa}
          detail={config?.wa_phone_number ?? undefined}
          onConnect={() => conectar('whatsapp')}
          onDisconnect={isGerencia ? () => desconectarCanal('whatsapp') : undefined}
          connecting={!!busy.whatsapp}
          extra={config?.estado_wa === 'conectado' ? (
            <div className="mb-1 space-y-2">
              {/* Verificación del negocio — clickeable para cambiar */}
              <button
                onClick={toggleVerificado}
                title="Haz clic para cambiar el estado de verificación"
                className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border transition-colors ${config?.negocio_verificado ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
              >
                <span className="flex items-center gap-1.5">
                  <span>{config?.negocio_verificado ? '✓' : '⚠'}</span>
                  <span>{config?.negocio_verificado ? 'Negocio verificado · límite 1 000/día' : 'No verificado / en revisión · límite 250/día'}</span>
                </span>
                <span className="text-gray-400 text-[10px]">cambiar</span>
              </button>
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Conversaciones iniciadas hoy</span>
                  <span className={`font-medium ${pct >= 90 ? 'text-red-600' : ''}`}>{config?.mensajes_iniciados_hoy ?? 0} / {limiteDiario}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button
                onClick={suscribirWebhook}
                disabled={!!busy.suscribir}
                className="w-full py-1.5 text-xs text-gray-500 hover:text-gray-800 border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition-colors disabled:opacity-50"
              >
                {busy.suscribir ? 'Verificando...' : '🔔 Verificar suscripción de mensajes'}
              </button>
            </div>
          ) : undefined}
        />

        {/* ── Messenger ─────────────────────────────────────────────── */}
        <ChannelCard
          icon={
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-700" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.91 1.395 5.514 3.58 7.235V21l3.27-1.797c.874.241 1.8.371 2.76.371C17.523 19.574 22 15.43 22 10.33 22 5.232 17.523 2 12 2m1.194 11.305l-2.64-2.815-5.154 2.815 5.67-6.018 2.706 2.815 5.085-2.815-5.667 6.018z"/>
            </svg>
          }
          name="Facebook Messenger"
          color="bg-blue-100"
          estado={config?.estado_messenger}
          detail={config?.messenger_page_id ? `Página ID: ${config.messenger_page_id}` : undefined}
          onConnect={() => conectar('messenger')}
          onDisconnect={isGerencia && config?.estado_messenger === 'conectado' ? () => desconectarCanal('messenger') : undefined}
          connecting={!!busy.messenger}
        />

        {/* ── Instagram ─────────────────────────────────────────────── */}
        <ChannelCard
          icon={
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-pink-600" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
            </svg>
          }
          name="Instagram Direct"
          color="bg-pink-100"
          estado={config?.estado_instagram}
          detail={config?.instagram_account_id ? `Cuenta ID: ${config.instagram_account_id}` : undefined}
          onConnect={() => conectar('instagram')}
          onDisconnect={isGerencia && config?.estado_instagram === 'conectado' ? () => desconectarCanal('instagram') : undefined}
          connecting={!!busy.instagram}
          disabled={true}
          disabledMsg="Requiere permisos adicionales: instagram_basic e instagram_manage_messages. Ve a developers.facebook.com → tu app → App Review → Permissions and Features."
        />

      </div>

      {/* ── Configuración manual (avanzado) ──────────────────────────── */}
      <div className="mt-6">
        <button onClick={() => setShowManual(!showManual)}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          {showManual ? '▲' : '▼'} Configuración avanzada / IDs de cuenta
        </button>
        {showManual && config && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {[
                ['App ID',          config.meta_app_id],
                ['Phone Number ID', config.wa_phone_number_id],
                ['WABA ID',         config.wa_business_account_id],
                ['Messenger Page',  config.messenger_page_id],
                ['Instagram ID',    config.instagram_account_id],
                ['Webhook Token',   config.meta_webhook_verify_token ? '••••' : '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-gray-400 mb-0.5">{k}</dt>
                  <dd className="font-mono text-gray-700 truncate">{v ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
