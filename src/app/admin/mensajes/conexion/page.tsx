'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ConfigMeta = {
  id?: string
  meta_app_id?: string | null
  meta_app_secret_enc?: string | null
  wa_phone_number_id?: string | null
  wa_phone_number?: string | null
  wa_business_account_id?: string | null
  wa_access_token_enc?: string | null
  messenger_page_id?: string | null
  messenger_access_token_enc?: string | null
  instagram_account_id?: string | null
  instagram_access_token_enc?: string | null
  meta_webhook_verify_token?: string | null
  negocio_verificado?: boolean
  estado_wa?: string | null
  estado_messenger?: string | null
  estado_instagram?: string | null
  limite_diario_wa?: number | null
  mensajes_iniciados_hoy?: number | null
  limite_reset_at?: string | null
}

type WizardData = {
  meta_app_id: string
  meta_app_secret: string
  wa_phone_number_id: string
  wa_phone_number: string
  wa_business_account_id: string
  wa_access_token: string
  messenger_page_id: string
  messenger_access_token: string
  instagram_account_id: string
  instagram_access_token: string
  meta_webhook_verify_token: string
}

const STEPS = [
  { num: 1, label: 'App Meta' },
  { num: 2, label: 'WhatsApp' },
  { num: 3, label: 'Webhook' },
  { num: 4, label: 'Messenger' },
  { num: 5, label: 'Instagram' },
  { num: 6, label: 'Verificar' },
  { num: 7, label: 'Confirmar' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ estado }: { estado?: string | null }) {
  const map: Record<string, string> = {
    conectado:    'bg-green-100 text-green-800',
    conectando:   'bg-yellow-100 text-yellow-800',
    error:        'bg-red-100 text-red-800',
    desconectado: 'bg-gray-100 text-gray-500',
  }
  const label: Record<string, string> = {
    conectado: 'Conectado', conectando: 'Conectando',
    error: 'Error', desconectado: 'Desconectado',
  }
  const key = estado ?? 'desconectado'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[key] ?? map.desconectado}`}>
      {label[key] ?? 'Desconectado'}
    </span>
  )
}

function LabeledInput({
  label, value, onChange, type = 'text', placeholder, hint, readOnly,
}: {
  label: string; value: string; onChange?: (v: string) => void
  type?: string; placeholder?: string; hint?: React.ReactNode; readOnly?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 read-only:bg-gray-50"
      />
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
  const [step, setStep]           = useState(1)
  const [toastMsg, setToastMsg]   = useState<{ text: string; ok: boolean } | null>(null)
  const [showDisconnect, setShowDisconnect] = useState(false)
  const [editMode, setEditMode]   = useState(false)

  const isGerencia = profile?.rol === 'gerencia'

  const [form, setForm] = useState<WizardData>({
    meta_app_id: '', meta_app_secret: '',
    wa_phone_number_id: '', wa_phone_number: '', wa_business_account_id: '', wa_access_token: '',
    messenger_page_id: '', messenger_access_token: '',
    instagram_account_id: '', instagram_access_token: '',
    meta_webhook_verify_token: '',
  })

  const set = (key: keyof WizardData) => (val: string) => setForm(p => ({ ...p, [key]: val }))

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

  const isConnected = !!config && config.estado_wa !== 'desconectado' && config.estado_wa !== null

  // Generar verify token aleatorio
  const generarVerifyToken = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let token = ''
    for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)]
    set('meta_webhook_verify_token')(token)
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://tu-dominio.vercel.app'
  const webhookUrl = config?.id
    ? `${appUrl}/api/webhooks/meta/${profile?.tenant_id}`
    : `${appUrl}/api/webhooks/meta/{tenant_id}`

  const guardar = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/mensajes/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          estado_wa: form.wa_access_token && form.wa_access_token !== '***' ? 'conectado' : (config?.estado_wa ?? 'desconectado'),
          negocio_verificado: true,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast('Configuración guardada correctamente')
      setEditMode(false)
      await cargar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al guardar', false)
    } finally {
      setSaving(false)
    }
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
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Estado B: Conectado ────────────────────────────────────────────────────
  if (isConnected && !editMode) {
    const pct = Math.round(
      ((config?.mensajes_iniciados_hoy ?? 0) / (config?.limite_diario_wa ?? 250)) * 100
    )
    const limitePct = Math.min(pct, 100)

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
              <button
                onClick={() => setEditMode(true)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Editar credenciales
              </button>
              <button
                onClick={() => setShowDisconnect(true)}
                className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Desconectar
              </button>
            </div>
          )}
        </div>

        {/* Tarjetas de estado por canal */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'WhatsApp Business', estado: config?.estado_wa, detalle: config?.wa_phone_number ?? '—', icon: '📱' },
            { label: 'Messenger',         estado: config?.estado_messenger, detalle: config?.messenger_page_id ? `Page ${config.messenger_page_id}` : 'No configurado', icon: '💬' },
            { label: 'Instagram',         estado: config?.estado_instagram, detalle: config?.instagram_account_id ? `Account ${config.instagram_account_id}` : 'No configurado', icon: '📸' },
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

        {/* Límite diario WhatsApp */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-medium text-gray-900 text-sm">Límite diario WhatsApp</h3>
              <p className="text-xs text-gray-500 mt-0.5">Mensajes iniciados hoy (resetea a medianoche)</p>
            </div>
            <span className="text-2xl font-bold text-gray-900">
              {config?.mensajes_iniciados_hoy ?? 0}
              <span className="text-sm font-normal text-gray-400"> / {config?.limite_diario_wa ?? 250}</span>
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${limitePct >= 90 ? 'bg-red-500' : limitePct >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${limitePct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{limitePct}% utilizado</p>
        </div>

        {/* Info adicional */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-medium text-gray-900 text-sm mb-3">Configuración Meta</h3>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">App ID</dt>
              <dd className="font-mono text-gray-900">{config?.meta_app_id ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Phone Number ID</dt>
              <dd className="font-mono text-gray-900">{config?.wa_phone_number_id ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Negocio verificado</dt>
              <dd className={config?.negocio_verificado ? 'text-green-700 font-medium' : 'text-gray-400'}>
                {config?.negocio_verificado ? 'Sí' : 'Pendiente'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs mb-0.5">Verify token</dt>
              <dd className="font-mono text-gray-900 truncate">{config?.meta_webhook_verify_token ? '••••••••' : '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Modal confirmación desconectar */}
        {showDisconnect && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
              <h3 className="font-bold text-gray-900 mb-2">¿Desconectar Meta?</h3>
              <p className="text-sm text-gray-600 mb-5">
                Se eliminarán todos los tokens guardados. El módulo de mensajería dejará de funcionar hasta que vuelvas a configurarlo.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowDisconnect(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                  Cancelar
                </button>
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

  // ── Estado A: Wizard de configuración ─────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Ve a <span className="font-medium text-blue-700">developers.facebook.com</span>, crea o selecciona tu app, y copia el App ID y App Secret desde <em>Configuración → Básico</em>.
            </p>
            <LabeledInput label="App ID" value={form.meta_app_id} onChange={set('meta_app_id')} placeholder="123456789012345" />
            <LabeledInput label="App Secret" value={form.meta_app_secret} onChange={set('meta_app_secret')} type="password"
              placeholder="••••••••" hint="Se almacena encriptado. Nunca se expone al cliente." />
          </div>
        )

      case 2:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              En Meta Business Suite, activa el producto <span className="font-medium">WhatsApp Business</span> y obtén los datos desde la sección de configuración de la API.
            </p>
            <LabeledInput label="WhatsApp Business Account ID (WABA ID)" value={form.wa_business_account_id} onChange={set('wa_business_account_id')} placeholder="123456789" />
            <LabeledInput label="Phone Number ID" value={form.wa_phone_number_id} onChange={set('wa_phone_number_id')} placeholder="987654321" />
            <LabeledInput label="Número de teléfono (con código de país)" value={form.wa_phone_number} onChange={set('wa_phone_number')} placeholder="+57 300 123 4567" />
            <LabeledInput label="Access Token (permanente)" value={form.wa_access_token} onChange={set('wa_access_token')} type="password"
              placeholder="EAAxxxxxxxxx..." hint="Usa un System User Token de larga duración desde Meta Business Manager." />
          </div>
        )

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              En <span className="font-medium">developers.facebook.com → WhatsApp → Configuración → Webhooks</span>, agrega esta URL y el verify token:
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL del Webhook (copiar en Meta)</label>
              <div className="flex gap-2">
                <input readOnly value={webhookUrl} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono" />
                <button
                  onClick={() => { navigator.clipboard.writeText(webhookUrl); toast('URL copiada') }}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                >
                  Copiar
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verify Token</label>
              <div className="flex gap-2">
                <input
                  value={form.meta_webhook_verify_token}
                  onChange={(e) => set('meta_webhook_verify_token')(e.target.value)}
                  placeholder="tu-verify-token-secreto"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <button
                  onClick={generarVerifyToken}
                  className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm transition-colors whitespace-nowrap"
                >
                  Generar
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">Copia el mismo token en el campo "Verify Token" de Meta.</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>Campos a suscribir en Meta:</strong> messages, messaging_postbacks, message_deliveries, message_reads, message_template_status_update
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Opcional.</span> Conecta una página de Facebook para recibir mensajes por Messenger. Deja en blanco para omitir.
            </p>
            <LabeledInput label="Page ID (ID de la página de Facebook)" value={form.messenger_page_id} onChange={set('messenger_page_id')} placeholder="123456789" />
            <LabeledInput label="Page Access Token" value={form.messenger_access_token} onChange={set('messenger_access_token')} type="password"
              placeholder="EAAxxxxxxxxx..." hint="Genera un token de página desde Meta Business Suite." />
          </div>
        )

      case 5:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Opcional.</span> Conecta una cuenta profesional de Instagram. Deja en blanco para omitir.
            </p>
            <LabeledInput label="Instagram Account ID" value={form.instagram_account_id} onChange={set('instagram_account_id')} placeholder="987654321" />
            <LabeledInput label="Instagram Access Token" value={form.instagram_access_token} onChange={set('instagram_access_token')} type="password"
              placeholder="EAAxxxxxxxxx..." hint="La cuenta de Instagram debe estar vinculada a una página de Facebook en Business Manager." />
          </div>
        )

      case 6:
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Revisa los datos ingresados antes de guardar.</p>
            <dl className="space-y-2 text-sm">
              {[
                { label: 'App ID', value: form.meta_app_id },
                { label: 'App Secret', value: form.meta_app_secret ? '••••••••' : '—' },
                { label: 'WABA ID', value: form.wa_business_account_id },
                { label: 'Phone Number ID', value: form.wa_phone_number_id },
                { label: 'Teléfono WA', value: form.wa_phone_number },
                { label: 'Access Token WA', value: form.wa_access_token ? '••••••••' : '—' },
                { label: 'Verify Token', value: form.meta_webhook_verify_token ? '••••••••' : '—' },
                { label: 'Messenger Page ID', value: form.messenger_page_id || 'No configurado' },
                { label: 'Instagram Account ID', value: form.instagram_account_id || 'No configurado' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <dt className="text-gray-500">{row.label}</dt>
                  <dd className="font-mono text-gray-900 text-xs">{row.value || '—'}</dd>
                </div>
              ))}
            </dl>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Asegúrate de haber configurado el webhook en Meta con la URL y el verify token generados en el paso 3.
            </div>
          </div>
        )

      case 7:
        return (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 text-lg">Todo listo para guardar</h3>
            <p className="text-sm text-gray-600 max-w-sm mx-auto">
              Al confirmar, las credenciales se guardarán encriptadas en la base de datos y el módulo de mensajería quedará activo.
            </p>
            <button
              onClick={guardar}
              disabled={saving}
              className="w-full py-3 bg-blue-700 text-white rounded-xl font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Confirmar y activar mensajería'}
            </button>
          </div>
        )

      default:
        return null
    }
  }

  const canNext = () => {
    if (step === 1) return !!(form.meta_app_id && form.meta_app_secret)
    if (step === 2) return !!(form.wa_business_account_id && form.wa_phone_number_id && form.wa_phone_number && form.wa_access_token)
    if (step === 3) return !!form.meta_webhook_verify_token
    return true
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMsg.text}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Conexión Meta</h1>
        <p className="text-sm text-gray-500 mt-0.5">Conecta WhatsApp Business, Messenger e Instagram</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => { if (s.num < step) setStep(s.num) }}
              className={`flex flex-col items-center gap-1 group ${s.num < step ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                s.num === step   ? 'bg-blue-700 border-blue-700 text-white' :
                s.num < step     ? 'bg-green-500 border-green-500 text-white' :
                                   'bg-white border-gray-200 text-gray-400'
              }`}>
                {s.num < step ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : s.num}
              </span>
              <span className="text-xs text-gray-500 hidden sm:block">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${s.num < step ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Panel del paso */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 min-h-64">
        <h2 className="font-bold text-gray-900 mb-4">
          Paso {step}: {STEPS[step - 1]?.label}
        </h2>
        {renderStep()}
      </div>

      {/* Navegación */}
      {step < 7 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
            className="px-5 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Atrás
          </button>
          <button
            onClick={() => setStep(s => Math.min(7, s + 1))}
            disabled={!canNext()}
            className="px-5 py-2 bg-blue-700 text-white rounded-lg text-sm hover:bg-blue-800 disabled:opacity-40 transition-colors"
          >
            {step === 6 ? 'Ver resumen' : 'Siguiente'}
          </button>
        </div>
      )}
    </div>
  )
}
