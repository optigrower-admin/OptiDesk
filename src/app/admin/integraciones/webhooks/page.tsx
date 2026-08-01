'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

const EVENTOS = [
  { key: 'lead.creado', label: 'Lead creado' },
  { key: 'conversacion.nueva', label: 'Conversación nueva' },
  { key: 'pago.recibido', label: 'Pago recibido' },
  { key: 'plantilla.aprobada', label: 'Plantilla aprobada' },
  { key: 'plantilla.rechazada', label: 'Plantilla rechazada' },
  { key: 'ia.resumen_generado', label: 'Resumen IA generado' },
  { key: 'ia.estudio_credito_solicitado', label: 'Agente IA: estudio de crédito solicitado' },
] as const

type Suscripcion = {
  id: string
  url_destino: string
  eventos: string[]
  secreto: string
  activo: boolean
  created_at: string
}

type Entrega = {
  id: string
  evento: string
  status_code_respuesta: number | null
  intento_numero: number
  exitoso: boolean
  created_at: string
}

function generarSecreto(): string {
  const bytes = new Uint8Array(24)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export default function WebhooksPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [subs, setSubs] = useState<Suscripcion[]>([])
  const [loading, setLoading] = useState(true)
  const [showNuevo, setShowNuevo] = useState(false)
  const [urlNueva, setUrlNueva] = useState('')
  const [eventosNuevo, setEventosNuevo] = useState<string[]>([])
  const [creando, setCreando] = useState(false)
  const [secretoGenerado, setSecretoGenerado] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [entregas, setEntregas] = useState<Record<string, Entrega[]>>({})
  const [probando, setProbando] = useState<string | null>(null)

  const esGerencia = profile?.rol === 'gerencia'

  const toast = (text: string, ok = true) => {
    setToastMsg({ text, ok })
    setTimeout(() => setToastMsg(null), 3500)
  }

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const { data } = await supabase
      .from('webhook_subscriptions')
      .select('id, url_destino, eventos, secreto, activo, created_at')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
    setSubs((data as Suscripcion[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  const verHistorial = async (id: string) => {
    if (expandido === id) { setExpandido(null); return }
    setExpandido(id)
    if (!entregas[id]) {
      const { data } = await supabase
        .from('webhook_deliveries')
        .select('id, evento, status_code_respuesta, intento_numero, exitoso, created_at')
        .eq('webhook_subscription_id', id)
        .order('created_at', { ascending: false })
        .limit(20)
      setEntregas(p => ({ ...p, [id]: (data as Entrega[]) ?? [] }))
    }
  }

  const crear = async () => {
    if (!urlNueva.trim() || !profile?.tenant_id) return
    setCreando(true)
    try {
      const secreto = generarSecreto()
      const { error } = await supabase.from('webhook_subscriptions').insert({
        tenant_id: profile.tenant_id,
        url_destino: urlNueva.trim(),
        eventos: eventosNuevo,
        secreto,
        creado_por: profile.id,
      })
      if (error) throw error
      setSecretoGenerado(secreto)
      setShowNuevo(false)
      setUrlNueva('')
      setEventosNuevo([])
      await cargar()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al crear la suscripción', false)
    } finally {
      setCreando(false)
    }
  }

  const toggleActivo = async (s: Suscripcion) => {
    const { error } = await supabase.from('webhook_subscriptions').update({ activo: !s.activo }).eq('id', s.id)
    if (error) { toast(error.message, false); return }
    await cargar()
  }

  const eliminar = async (s: Suscripcion) => {
    if (!confirm('¿Eliminar esta suscripción de webhook?')) return
    const { error } = await supabase.from('webhook_subscriptions').delete().eq('id', s.id)
    if (error) { toast(error.message, false); return }
    toast('Suscripción eliminada')
    await cargar()
  }

  const probar = async (id: string) => {
    setProbando(id)
    try {
      const r = await fetch('/api/admin/integraciones/webhooks/probar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_id: id }),
      })
      const result = await r.json()
      if (!r.ok) throw new Error(result.error ?? 'Error al probar')
      toast('Evento test.ping enviado')
      if (expandido === id) { setEntregas(p => { const n = { ...p }; delete n[id]; return n }); await verHistorial(id); }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al probar', false)
    } finally {
      setProbando(null)
    }
  }

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto)
    toast('Copiado al portapapeles')
  }

  if (!esGerencia && !loading) {
    return <div className="p-6 text-sm text-gray-500">Esta sección es solo para el rol Gerencia.</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg max-w-sm ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMsg.text}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Recibe eventos de OptiDesk en tu propio sistema. Cada envío va firmado con HMAC-SHA256 en el header <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">X-OptiDesk-Signature</code>.
          </p>
        </div>
        <button
          onClick={() => { setShowNuevo(true); setEventosNuevo([]) }}
          className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          + Nueva suscripción
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : subs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin suscripciones de webhook aún.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {subs.map(s => (
              <div key={s.id} className={!s.activo ? 'opacity-50' : ''}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.url_destino}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {s.eventos.map(e => (
                          <span key={e} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                            {EVENTOS.find(ev => ev.key === e)?.label ?? e}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${s.activo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <button onClick={() => probar(s.id)} disabled={probando === s.id}
                      className="text-xs text-purple-700 font-semibold hover:text-purple-900 disabled:opacity-50">
                      {probando === s.id ? 'Enviando...' : 'Probar'}
                    </button>
                    <button onClick={() => verHistorial(s.id)} className="text-xs text-blue-700 font-semibold hover:text-blue-900">
                      {expandido === s.id ? 'Ocultar historial' : 'Ver historial'}
                    </button>
                    <button onClick={() => toggleActivo(s)} className="text-xs text-gray-500 font-semibold hover:text-gray-700">
                      {s.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => eliminar(s)} className="text-xs text-red-600 font-semibold hover:text-red-800 ml-auto">
                      Eliminar
                    </button>
                  </div>
                </div>
                {expandido === s.id && (
                  <div className="bg-gray-50 border-t border-gray-100 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Últimas 20 entregas</p>
                    {!entregas[s.id] ? (
                      <p className="text-xs text-gray-400">Cargando...</p>
                    ) : entregas[s.id].length === 0 ? (
                      <p className="text-xs text-gray-400">Sin entregas todavía.</p>
                    ) : (
                      <div className="space-y-1">
                        {entregas[s.id].map(d => (
                          <div key={d.id} className="flex items-center gap-2 text-xs">
                            <span className={`px-1.5 py-0.5 rounded-full font-medium ${d.exitoso ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {d.exitoso ? 'OK' : 'Falló'}
                            </span>
                            <span className="text-gray-600 font-mono">{d.evento}</span>
                            <span className="text-gray-400">status {d.status_code_respuesta ?? '—'}</span>
                            <span className="text-gray-400">intento {d.intento_numero}</span>
                            <span className="text-gray-400 ml-auto">{new Date(d.created_at).toLocaleString('es-CO')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nueva suscripción */}
      {showNuevo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="font-bold text-gray-900">Nueva suscripción de webhook</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL destino</label>
              <input
                value={urlNueva}
                onChange={e => setUrlNueva(e.target.value)}
                placeholder="https://tu-sistema.com/webhooks/optidesk"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Eventos</label>
              <div className="space-y-1.5">
                {EVENTOS.map(e => (
                  <label key={e.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eventosNuevo.includes(e.key)}
                      onChange={ev => setEventosNuevo(p => ev.target.checked ? [...p, e.key] : p.filter(x => x !== e.key))}
                    />
                    {e.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowNuevo(false)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={crear} disabled={!urlNueva.trim() || creando} className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {creando ? 'Creando...' : 'Crear suscripción'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal secreto generado (una sola vez) */}
      {secretoGenerado && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="font-bold text-gray-900">✅ Suscripción creada</h3>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Guarda este secreto — lo necesitas para verificar la firma <code className="text-xs">X-OptiDesk-Signature</code> en tu servidor.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <code className="flex-1 text-xs font-mono text-gray-800 break-all">{secretoGenerado}</code>
              <button onClick={() => copiar(secretoGenerado)} className="text-xs text-blue-700 font-semibold hover:text-blue-900 flex-shrink-0">
                Copiar
              </button>
            </div>
            <button onClick={() => setSecretoGenerado(null)} className="w-full px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800">
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
