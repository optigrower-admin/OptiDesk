'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

const PROVEEDORES = [
  { key: 'OPENAI', label: 'OpenAI', icono: '🤖', modeloEjemplo: 'gpt-4o-mini' },
  { key: 'ANTHROPIC', label: 'Anthropic', icono: '🧠', modeloEjemplo: 'claude-haiku-4-5-20251001' },
  { key: 'GOOGLE', label: 'Google (Gemini)', icono: '✨', modeloEjemplo: 'gemini-2.0-flash' },
  { key: 'GROK', label: 'Grok (xAI)', icono: '⚡', modeloEjemplo: 'grok-2-latest' },
  { key: 'ELEVENLABS', label: 'ElevenLabs', icono: '🔊', modeloEjemplo: 'eleven_multilingual_v2' },
] as const

const USOS = [
  { key: 'resumenes_conversacion', label: 'Resúmenes de conversación' },
  { key: 'analisis_imagen_chat', label: 'Analizar fotos que manda el cliente por chat' },
  { key: 'analisis_conversaciones_agente', label: 'Analizar conversaciones y sugerir mejoras al agente' },
  { key: 'sugerencias_respuesta', label: 'Sugerencias de respuesta' },
  { key: 'clasificacion_intencion', label: 'Clasificar intención del mensaje' },
  { key: 'transcripcion_audio', label: 'Transcripción de audio a texto' },
  { key: 'generar_audio', label: 'Generar audio desde texto' },
  { key: 'generar_imagen', label: 'Generar imagen' },
] as const

type Integracion = {
  id: string
  proveedor: typeof PROVEEDORES[number]['key']
  modelo_default: string | null
  activo: boolean
  uso_asignado: string[]
  updated_at: string
}

type UsoMes = { proveedor: string; uso: string; llamadas: number; costo: number }

export default function IntegracionesIAPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [integraciones, setIntegraciones] = useState<Integracion[]>([])
  const [usoMes, setUsoMes] = useState<UsoMes[]>([])
  const [loading, setLoading] = useState(true)
  const [modalProveedor, setModalProveedor] = useState<typeof PROVEEDORES[number] | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [modeloInput, setModeloInput] = useState('')
  const [usosInput, setUsosInput] = useState<string[]>([])
  const [conectando, setConectando] = useState(false)
  const [errorConexion, setErrorConexion] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const esGerencia = profile?.rol === 'gerencia'

  const toast = (text: string, ok = true) => {
    setToastMsg({ text, ok })
    setTimeout(() => setToastMsg(null), 3500)
  }

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const [{ data: ints }, { data: usos }] = await Promise.all([
      supabase.from('integraciones_ia').select('id, proveedor, modelo_default, activo, uso_asignado, updated_at').eq('tenant_id', profile.tenant_id),
      supabase.from('ia_usage_logs').select('proveedor, uso, costo_estimado')
        .eq('tenant_id', profile.tenant_id)
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ])
    setIntegraciones((ints as Integracion[]) ?? [])
    const agg = new Map<string, UsoMes>()
    for (const u of usos ?? []) {
      const key = `${u.proveedor}:${u.uso}`
      const prev = agg.get(key) ?? { proveedor: u.proveedor, uso: u.uso, llamadas: 0, costo: 0 }
      prev.llamadas += 1
      prev.costo += Number(u.costo_estimado ?? 0)
      agg.set(key, prev)
    }
    setUsoMes([...agg.values()])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  const integracionPorProveedor = useMemo(() => {
    const m = new Map<string, Integracion>()
    integraciones.forEach(i => m.set(i.proveedor, i))
    return m
  }, [integraciones])

  const abrirConectar = (p: typeof PROVEEDORES[number]) => {
    const existente = integracionPorProveedor.get(p.key)
    setModalProveedor(p)
    setApiKeyInput('')
    setModeloInput(existente?.modelo_default ?? p.modeloEjemplo)
    setUsosInput(existente?.uso_asignado ?? [])
    setErrorConexion(null)
  }

  const conectar = async () => {
    if (!modalProveedor || !apiKeyInput.trim()) return
    setConectando(true)
    setErrorConexion(null)
    try {
      const r = await fetch('/api/admin/integraciones/ia/conectar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor: modalProveedor.key,
          api_key: apiKeyInput.trim(),
          modelo_default: modeloInput.trim() || undefined,
          uso_asignado: usosInput,
        }),
      })
      const result = await r.json()
      if (!r.ok) { setErrorConexion(result.error ?? 'No se pudo conectar'); return }
      toast(`${modalProveedor.label} conectado`)
      setModalProveedor(null)
      await cargar()
    } catch {
      setErrorConexion('No se pudo conectar con el proveedor')
    } finally {
      setConectando(false)
    }
  }

  const toggleActivo = async (i: Integracion) => {
    const { error } = await supabase.from('integraciones_ia').update({ activo: !i.activo }).eq('id', i.id)
    if (error) { toast(error.message, false); return }
    await cargar()
  }

  const actualizarUsos = async (i: Integracion, usos: string[]) => {
    const { error } = await supabase.from('integraciones_ia').update({ uso_asignado: usos }).eq('id', i.id)
    if (error) { toast(error.message, false); return }
    await cargar()
  }

  if (!esGerencia && !loading) {
    return <div className="p-6 text-sm text-gray-500">Esta sección es solo para el rol Gerencia.</div>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm text-white shadow-lg max-w-sm ${toastMsg.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toastMsg.text}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integraciones IA</h1>
        <p className="text-sm text-gray-500 mt-1">
          Conecta proveedores de IA para usarlos en resúmenes, sugerencias de respuesta y en el nodo &quot;Acción IA&quot; de Flujos.
        </p>
      </div>

      {/* Cards por proveedor */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PROVEEDORES.map(p => {
          const i = integracionPorProveedor.get(p.key)
          const conectado = !!i
          return (
            <div key={p.key} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{p.icono}</span>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{p.label}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${conectado && i?.activo ? 'bg-green-100 text-green-700' : conectado ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
                      {conectado ? (i?.activo ? 'Conectado' : 'Desactivado') : 'No conectado'}
                    </span>
                  </div>
                </div>
                <button onClick={() => abrirConectar(p)} className="text-xs text-blue-700 font-semibold hover:text-blue-900">
                  {conectado ? 'Reemplazar key' : 'Conectar'}
                </button>
              </div>
              {conectado && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-400">Modelo: <span className="font-mono text-gray-600">{i?.modelo_default ?? '(por defecto)'}</span></p>
                  <div>
                    <p className="text-[11px] text-gray-400 mb-1">Usada para:</p>
                    <div className="flex flex-wrap gap-1">
                      {USOS.map(u => (
                        <button
                          key={u.key}
                          onClick={() => actualizarUsos(i!, i!.uso_asignado.includes(u.key) ? i!.uso_asignado.filter(x => x !== u.key) : [...i!.uso_asignado, u.key])}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${
                            i!.uso_asignado.includes(u.key) ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {u.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => toggleActivo(i!)} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                    {i?.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Uso del mes */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="font-semibold text-gray-900 text-sm">Uso de este mes</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : usoMes.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin llamadas registradas este mes.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Proveedor</th>
                <th className="text-left px-4 py-2">Uso</th>
                <th className="text-right px-4 py-2">Llamadas</th>
                <th className="text-right px-4 py-2">Costo estimado (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usoMes.map((u, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-gray-700">{u.proveedor}</td>
                  <td className="px-4 py-2 text-gray-500">{USOS.find(x => x.key === u.uso)?.label ?? u.uso}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{u.llamadas}</td>
                  <td className="px-4 py-2 text-right text-gray-700">${u.costo.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal conectar */}
      {modalProveedor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="font-bold text-gray-900">{modalProveedor.icono} Conectar {modalProveedor.label}</h3>
            {errorConexion && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{errorConexion}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API key</label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="sk-..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modelo por defecto</label>
              <input
                value={modeloInput}
                onChange={e => setModeloInput(e.target.value)}
                placeholder={modalProveedor.modeloEjemplo}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">¿Para qué se usa?</label>
              <div className="space-y-1.5">
                {USOS.map(u => (
                  <label key={u.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usosInput.includes(u.key)}
                      onChange={e => setUsosInput(p => e.target.checked ? [...p, u.key] : p.filter(x => x !== u.key))}
                    />
                    {u.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalProveedor(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={conectar} disabled={!apiKeyInput.trim() || conectando} className="flex-1 px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {conectando ? 'Probando conexión...' : 'Conectar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
