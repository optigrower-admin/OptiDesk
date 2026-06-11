'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

declare global {
  interface Window {
    FB: {
      init: (opts: object) => void
      login: (cb: (r: { authResponse?: { code?: string } }) => void, opts: object) => void
    }
    fbAsyncInit: () => void
  }
}

type ConfigMeta = {
  id?: string
  meta_app_id?: string | null
  wa_phone_number_id?: string | null
  wa_phone_number?: string | null
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

type PhoneNumber = { id: string; display_phone_number: string; verified_name: string }
type SignupData  = { waba_id: string; waba_name: string; phone_numbers: PhoneNumber[]; access_token: string }

function Badge({ estado }: { estado?: string | null }) {
  const map: Record<string, string> = {
    conectado: 'bg-green-100 text-green-800', conectando: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800', desconectado: 'bg-gray-100 text-gray-500',
  }
  const label: Record<string, string> = {
    conectado: 'Conectado', conectando: 'Conectando', error: 'Error', desconectado: 'Desconectado',
  }
  const key = estado ?? 'desconectado'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[key] ?? map.desconectado}`}>
      {label[key] ?? 'Desconectado'}
    </span>
  )
}

// ─── Wizard manual (modo avanzado) ────────────────────────────────────────────

type WizardData = {
  meta_app_id: string; meta_app_secret: string; wa_phone_number_id: string
  wa_phone_number: string; wa_business_account_id: string; wa_access_token: string
  messenger_page_id: string; messenger_access_token: string
  instagram_account_id: string; instagram_access_token: string; meta_webhook_verify_token: string
}

function LabeledInput({ label, value, onChange, type = 'text', placeholder, hint, readOnly }: {
  label: string; value: string; onChange?: (v: string) => void
  type?: string; placeholder?: string; hint?: React.ReactNode; readOnly?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={onChange ? e => onChange(e.target.value) : undefined}
        readOnly={readOnly} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white read-only:bg-gray-50" />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ConexionMetaPage() {
  const { profile } = useAuth()
  const [config, setConfig]       = useState<ConfigMeta | null>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [toastMsg, setToastMsg]   = useState<{ text: string; ok: boolean } | null>(null)
  const [showDisconnect, setShowDisconnect] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [editMode, setEditMode]   = useState(false)

  // Embedded Signup state
  const [sdkReady, setSdkReady]       = useState(false)
  const [signupStep, setSignupStep]   = useState<'idle' | 'loading' | 'select' | 'saving'>('idle')
  const [signupData, setSignupData]   = useState<SignupData | null>(null)
  const [selectedPhone, setSelectedPhone] = useState<PhoneNumber | null>(null)

  // Manual wizard state
  const [wizStep, setWizStep] = useState(1)
  const [form, setForm] = useState<WizardData>({
    meta_app_id: '', meta_app_secret: '', wa_phone_number_id: '', wa_phone_number: '',
    wa_business_account_id: '', wa_access_token: '', messenger_page_id: '', messenger_access_token: '',
    instagram_account_id: '', instagram_access_token: '', meta_webhook_verify_token: '',
  })
  const set = (key: keyof WizardData) => (val: string) => setForm(p => ({ ...p, [key]: val }))

  const isGerencia = profile?.rol === 'gerencia'

  const toast = (text: string, ok = true) => {
    setToastMsg({ text, ok })
    setTimeout(() => setToastMsg(null), 3500)
  }

  const cargar = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/mensajes/config')
    const json = await res.json()
    setConfig(json.config ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Cargar Facebook SDK
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.fbAsyncInit = function () {
      window.FB.init({ appId: process.env.NEXT_PUBLIC_META_APP_ID, autoLogAppEvents: true, xfbml: true, version: 'v20.0' })
      setSdkReady(true)
    }
    if (!document.getElementById('facebook-jssdk')) {
      const script = document.createElement('script')
      script.id = 'facebook-jssdk'
      script.src = 'https://connect.facebook.net/es_LA/sdk.js'
      script.async = true
      script.defer = true
      document.body.appendChild(script)
    } else {
      setSdkReady(true)
    }
  }, [])

  const isConnected = !!config && config.estado_wa !== 'desconectado' && config.estado_wa !== null

  const appUrl    = typeof window !== 'undefined' ? window.location.origin : ''
  const webhookUrl = `${appUrl}/api/webhooks/meta`

  // ── Embedded Signup ──────────────────────────────────────────────────────────
  const handleEmbeddedSignup = () => {
    if (!sdkReady || !window.FB) { toast('SDK de Meta cargando, intenta en un segundo', false); return }
    setSignupStep('loading')

    window.FB.login((response) => {
      if (!response.authResponse?.code) {
        setSignupStep('idle')
        if (response.authResponse === undefined) return // usuario cerró el popup
        toast('No se obtuvo autorización de Meta', false)
        return
      }
      intercambiarCodigo(response.authResponse.code)
    }, {
      scope: 'whatsapp_business_management,whatsapp_business_messaging',
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
    })
  }

  const intercambiarCodigo = async (code: string) => {
    setSignupStep('loading')
    try {
      const res = await fetch('/api/admin/mensajes/embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSignupData(data)
      setSelectedPhone(data.phone_numbers[0] ?? null)
      setSignupStep('select')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al conectar', false)
      setSignupStep('idle')
    }
  }

  const confirmarConexion = async () => {
    if (!signupData || !selectedPhone) return
    setSignupStep('saving')
    try {
      const res = await fetch('/api/admin/mensajes/embedded-signup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waba_id: signupData.waba_id,
          phone_number_id: selectedPhone.id,
          phone_number: selectedPhone.display_phone_number,
          verified_name: selectedPhone.verified_name,
          access_token: signupData.access_token,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast('WhatsApp conectado correctamente')
      setSignupStep('idle')
      await cargar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al guardar', false)
      setSignupStep('select')
    }
  }

  // ── Manual save ──────────────────────────────────────────────────────────────
  const guardarManual = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/mensajes/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, estado_wa: form.wa_access_token ? 'conectado' : 'desconectado', negocio_verificado: true }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast('Configuración guardada')
      setShowManual(false); setEditMode(false)
      await cargar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al guardar', false)
    } finally { setSaving(false) }
  }

  const desconectar = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/mensajes/config', { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast('Desconectado correctamente')
      setShowDisconnect(false)
      await cargar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error', false)
    } finally { setSaving(false) }
  }

  const generarVerifyToken = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let t = ''; for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)]
    set('meta_webhook_verify_token')(t)
  }

  if (loading) return (
    <div className="p-8 flex items-center justify-center min-h-64">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ══ ESTADO B: Conectado ══════════════════════════════════════════════════════
  if (isConnected && !editMode) {
    const pct = Math.min(Math.round(((config?.mensajes_iniciados_hoy ?? 0) / (config?.limite_diario_wa ?? 250)) * 100), 100)
    return (
      <div className="p-6 max-w-3xl mx-auto">
        {toastMsg && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
            {toastMsg.text}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Conexión Meta</h1>
            <p className="text-sm text-gray-500 mt-0.5">Estado de canales y límites</p>
          </div>
          {isGerencia && (
            <div className="flex gap-2">
              <button onClick={() => setEditMode(true)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                Editar credenciales
              </button>
              <button onClick={() => setShowDisconnect(true)} className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
                Desconectar
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'WhatsApp Business', estado: config?.estado_wa,        detalle: config?.wa_phone_number ?? '—',                                  icon: '📱' },
            { label: 'Messenger',         estado: config?.estado_messenger,  detalle: config?.messenger_page_id ? `Page ${config.messenger_page_id}` : 'No configurado', icon: '💬' },
            { label: 'Instagram',         estado: config?.estado_instagram,  detalle: config?.instagram_account_id ? `Account ${config.instagram_account_id}` : 'No configurado', icon: '📸' },
          ].map(ch => (
            <div key={ch.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">{ch.icon}</span>
                <Badge estado={ch.estado} />
              </div>
              <p className="font-medium text-gray-900 text-sm">{ch.label}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{ch.detalle}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-medium text-gray-900 text-sm">Límite diario WhatsApp</h3>
              <p className="text-xs text-gray-500 mt-0.5">Mensajes iniciados hoy</p>
            </div>
            <span className="text-2xl font-bold text-gray-900">
              {config?.mensajes_iniciados_hoy ?? 0}
              <span className="text-sm font-normal text-gray-400"> / {config?.limite_diario_wa ?? 250}</span>
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{pct}% utilizado</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-medium text-gray-900 text-sm mb-3">Configuración</h3>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['App ID', config?.meta_app_id ?? '—'],
              ['Phone Number ID', config?.wa_phone_number_id ?? '—'],
              ['WABA ID', config?.wa_business_account_id ?? '—'],
              ['Negocio verificado', config?.negocio_verificado ? 'Sí' : 'Pendiente'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-500 text-xs mb-0.5">{k}</dt>
                <dd className="font-mono text-gray-900 text-xs truncate">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {showDisconnect && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <h3 className="font-bold text-gray-900 mb-2">¿Desconectar Meta?</h3>
              <p className="text-sm text-gray-600 mb-5">Se eliminarán todos los tokens. El módulo de mensajería dejará de funcionar.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDisconnect(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
                <button onClick={desconectar} disabled={saving} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                  {saving ? 'Desconectando...' : 'Desconectar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ══ ESTADO A: Embedded Signup ════════════════════════════════════════════════

  // Paso: seleccionar número de teléfono
  if (signupStep === 'select' && signupData) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        {toastMsg && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
            {toastMsg.text}
          </div>
        )}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Selecciona tu número</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cuenta: <span className="font-medium text-gray-700">{signupData.waba_name}</span></p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4">
          {signupData.phone_numbers.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-600 text-sm mb-2">No se encontraron números registrados en esta cuenta.</p>
              <p className="text-xs text-gray-400">Agrega un número en Meta Business Manager y vuelve a intentarlo.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {signupData.phone_numbers.map(phone => (
                <label key={phone.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${selectedPhone?.id === phone.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="phone" value={phone.id} checked={selectedPhone?.id === phone.id}
                    onChange={() => setSelectedPhone(phone)} className="accent-blue-600" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{phone.display_phone_number}</p>
                    <p className="text-xs text-gray-500">{phone.verified_name}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={() => { setSignupStep('idle'); setSignupData(null) }}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={confirmarConexion} disabled={!selectedPhone || signupStep === 'saving'}
            className="flex-1 px-4 py-2.5 bg-blue-700 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
            {signupStep === 'saving' ? 'Conectando...' : 'Confirmar y conectar'}
          </button>
        </div>
      </div>
    )
  }

  // Wizard manual (modo avanzado)
  if (showManual || editMode) {
    const STEPS = [
      { num: 1, label: 'App Meta' }, { num: 2, label: 'WhatsApp' }, { num: 3, label: 'Webhook' },
      { num: 4, label: 'Messenger' }, { num: 5, label: 'Instagram' }, { num: 6, label: 'Verificar' }, { num: 7, label: 'Confirmar' },
    ]
    const renderWizStep = () => {
      switch (wizStep) {
        case 1: return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">App ID y App Secret desde <em>developers.facebook.com → Configuración → Básico</em>.</p>
            <LabeledInput label="App ID" value={form.meta_app_id} onChange={set('meta_app_id')} placeholder="123456789012345" />
            <LabeledInput label="App Secret" value={form.meta_app_secret} onChange={set('meta_app_secret')} type="password" placeholder="••••••••" hint="Se almacena encriptado." />
          </div>
        )
        case 2: return (
          <div className="space-y-4">
            <LabeledInput label="WABA ID" value={form.wa_business_account_id} onChange={set('wa_business_account_id')} placeholder="123456789" />
            <LabeledInput label="Phone Number ID" value={form.wa_phone_number_id} onChange={set('wa_phone_number_id')} placeholder="987654321" />
            <LabeledInput label="Número de teléfono" value={form.wa_phone_number} onChange={set('wa_phone_number')} placeholder="+57 300 123 4567" />
            <LabeledInput label="Access Token" value={form.wa_access_token} onChange={set('wa_access_token')} type="password" placeholder="EAAxxxxxxxxx..." hint="Usa un System User Token permanente." />
          </div>
        )
        case 3: return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Configura este webhook en Meta → WhatsApp → Configuración:</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL del Webhook</label>
              <div className="flex gap-2">
                <input readOnly value={webhookUrl} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono" />
                <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast('URL copiada') }} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">Copiar</button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verify Token</label>
              <div className="flex gap-2">
                <input value={form.meta_webhook_verify_token} onChange={e => set('meta_webhook_verify_token')(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
                <button onClick={generarVerifyToken} className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm whitespace-nowrap">Generar</button>
              </div>
            </div>
          </div>
        )
        case 4: return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600"><strong>Opcional.</strong> Página de Facebook para Messenger.</p>
            <LabeledInput label="Page ID" value={form.messenger_page_id} onChange={set('messenger_page_id')} placeholder="123456789" />
            <LabeledInput label="Page Access Token" value={form.messenger_access_token} onChange={set('messenger_access_token')} type="password" placeholder="EAAxxxxxxxxx..." />
          </div>
        )
        case 5: return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600"><strong>Opcional.</strong> Cuenta profesional de Instagram.</p>
            <LabeledInput label="Instagram Account ID" value={form.instagram_account_id} onChange={set('instagram_account_id')} placeholder="987654321" />
            <LabeledInput label="Instagram Access Token" value={form.instagram_access_token} onChange={set('instagram_access_token')} type="password" placeholder="EAAxxxxxxxxx..." />
          </div>
        )
        case 6: return (
          <div className="space-y-2 text-sm">
            {[['App ID', form.meta_app_id], ['WABA ID', form.wa_business_account_id], ['Phone Number ID', form.wa_phone_number_id],
              ['Teléfono', form.wa_phone_number], ['Access Token', form.wa_access_token ? '••••••••' : '—'],
              ['Verify Token', form.meta_webhook_verify_token ? '••••••••' : '—']].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-gray-100">
                <span className="text-gray-500">{k}</span>
                <span className="font-mono text-gray-900 text-xs">{v || '—'}</span>
              </div>
            ))}
          </div>
        )
        case 7: return (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-900">Todo listo para guardar</h3>
            <button onClick={guardarManual} disabled={saving} className="w-full py-3 bg-blue-700 text-white rounded-xl font-semibold hover:bg-blue-800 disabled:opacity-50">
              {saving ? 'Guardando...' : 'Confirmar y activar mensajería'}
            </button>
          </div>
        )
        default: return null
      }
    }
    const canNext = () => {
      if (wizStep === 1) return !!(form.meta_app_id && form.meta_app_secret)
      if (wizStep === 2) return !!(form.wa_business_account_id && form.wa_phone_number_id && form.wa_phone_number && form.wa_access_token)
      if (wizStep === 3) return !!form.meta_webhook_verify_token
      return true
    }
    return (
      <div className="p-6 max-w-2xl mx-auto">
        {toastMsg && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
            {toastMsg.text}
          </div>
        )}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setShowManual(false); setEditMode(false) }} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Configuración manual</h1>
            <p className="text-sm text-gray-500">Para usuarios avanzados</p>
          </div>
        </div>
        <div className="flex items-center mb-8">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center flex-1 last:flex-none">
              <button onClick={() => { if (s.num < wizStep) setWizStep(s.num) }} className="flex flex-col items-center gap-1">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${s.num === wizStep ? 'bg-blue-700 border-blue-700 text-white' : s.num < wizStep ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-200 text-gray-400'}`}>
                  {s.num < wizStep ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : s.num}
                </span>
                <span className="text-xs text-gray-500 hidden sm:block">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${s.num < wizStep ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-6 min-h-64">
          <h2 className="font-bold text-gray-900 mb-4">Paso {wizStep}: {STEPS[wizStep - 1]?.label}</h2>
          {renderWizStep()}
        </div>
        {wizStep < 7 && (
          <div className="flex items-center justify-between mt-4">
            <button onClick={() => setWizStep(s => Math.max(1, s - 1))} disabled={wizStep === 1}
              className="px-5 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40">Atrás</button>
            <button onClick={() => setWizStep(s => Math.min(7, s + 1))} disabled={!canNext()}
              className="px-5 py-2 bg-blue-700 text-white rounded-lg text-sm hover:bg-blue-800 disabled:opacity-40">
              {wizStep === 6 ? 'Ver resumen' : 'Siguiente'}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Pantalla principal: botón Embedded Signup ────────────────────────────────
  return (
    <div className="p-6 max-w-lg mx-auto">
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMsg.text}
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">Conexión Meta</h1>
        <p className="text-sm text-gray-500 mt-0.5">Conecta WhatsApp Business, Messenger e Instagram</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center mb-4">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg viewBox="0 0 36 36" className="w-9 h-9" fill="none">
            <path d="M18 2C9.163 2 2 9.163 2 18c0 8.836 7.163 16 16 16s16-7.164 16-16C34 9.163 26.837 2 18 2z" fill="#1877F2"/>
            <path d="M22.24 14.64h-2.88v-1.92c0-.795.528-1.008.9-1.008H22.2V9.008L19.38 9C16.26 9 15.54 11.22 15.54 12.6v2.04H13.8V17.4h1.74V27h3.66V17.4h2.46l.54-2.76z" fill="white"/>
          </svg>
        </div>

        <h2 className="text-lg font-bold text-gray-900 mb-2">Conecta tu WhatsApp en segundos</h2>
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          Inicia sesión con tu cuenta de Facebook Business y selecciona el número de WhatsApp que quieres usar. Sin configuraciones técnicas.
        </p>

        <div className="space-y-3 mb-8">
          {[
            { icon: '✓', text: 'WhatsApp Business — recibe y envía mensajes' },
            { icon: '✓', text: 'Messenger — mensajes de tu página de Facebook' },
            { icon: '✓', text: 'Instagram Direct — mensajes de tu cuenta profesional' },
          ].map(item => (
            <div key={item.text} className="flex items-center gap-3 text-sm text-gray-600">
              <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{item.icon}</span>
              {item.text}
            </div>
          ))}
        </div>

        {signupStep === 'loading' ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Conectando con Meta...</p>
          </div>
        ) : (
          <button
            onClick={handleEmbeddedSignup}
            disabled={!sdkReady}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-[#1877F2] hover:bg-[#1565d8] text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96C18.34 21.21 22 17.06 22 12.06C22 6.53 17.5 2.04 12 2.04Z"/>
            </svg>
            Conectar con Meta
          </button>
        )}
      </div>

      <button
        onClick={() => setShowManual(true)}
        className="w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        Configuración manual avanzada →
      </button>
    </div>
  )
}
