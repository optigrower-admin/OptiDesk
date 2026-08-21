'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

interface Agente {
  id: string
  nombre: string
  descripcion: string | null
  proveedor: string
  modelo: string | null
  integracion_ia_id: string | null
  herramientas_habilitadas: string[]
  activo: boolean
  created_at: string
  prompt_sistema: string | null
  instrucciones: string | null
}
interface Integracion { id: string; proveedor: string; modelo_default: string | null; activo: boolean }
interface HerramientaInfo { nombre: string; descripcion: string }
interface Ejecucion {
  id: string; conversacion_id: string | null; mensaje_entrada: string | null
  herramienta_invocada: string | null; parametros_herramienta: unknown; respuesta_texto: string | null
  exitoso: boolean; error_mensaje: string | null; duracion_ms: number | null; created_at: string
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400'
const labelCls = 'text-xs font-medium text-gray-500 mb-1 block'

// Modelos disponibles por proveedor para agentes conversacionales (con
// tool-calling) — mismo criterio de costo/capacidad que el selector del
// constructor de Flujos. Google no soporta herramientas todavía (responde
// solo texto) y ElevenLabs no aplica a agentes conversacionales.
const MODELOS_AGENTE: Record<string, { modelo: string; label: string; ayuda: string }[]> = {
  OPENAI: [
    { modelo: 'gpt-4o-mini', label: 'GPT-4o mini', ayuda: '💰 Económico y rápido — recomendado por defecto para conversar con clientes.' },
    { modelo: 'gpt-4o', label: 'GPT-4o', ayuda: '💰💰💰 Más capaz, mejor razonamiento — más lento y varias veces más costoso.' },
  ],
  ANTHROPIC: [
    { modelo: 'claude-haiku-4-5-20251001', label: 'Claude Haiku', ayuda: '💰 Económico y rápido — recomendado por defecto.' },
    { modelo: 'claude-sonnet-4-6', label: 'Claude Sonnet', ayuda: '💰💰💰 Más capaz — más costoso, úsalo solo si el agente necesita razonar casos complejos.' },
  ],
  GOOGLE: [
    { modelo: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', ayuda: '💰 Económico. Nota: Google aún no puede usar herramientas (solo responde texto).' },
    { modelo: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', ayuda: '💰💰 Más capaz. Nota: Google aún no puede usar herramientas (solo responde texto).' },
  ],
  GROK: [{ modelo: 'grok-2-latest', label: 'Grok 2', ayuda: 'Modelo general de xAI.' }],
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AgentesIAPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [agentes, setAgentes] = useState<Agente[]>([])
  const [integraciones, setIntegraciones] = useState<Integracion[]>([])
  const [catalogoHerramientas, setCatalogoHerramientas] = useState<HerramientaInfo[]>([])
  const [puedeEditar, setPuedeEditar] = useState(false)
  const [loading, setLoading] = useState(true)

  const [editando, setEditando] = useState<Agente | 'new' | null>(null)
  const [ejecucionesDe, setEjecucionesDe] = useState<Agente | null>(null)
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([])
  const [cargandoEjec, setCargandoEjec] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/agentes-ia')
    const result = await r.json()
    setAgentes(result.agentes ?? [])
    setPuedeEditar(!!result.puedeEditar)
    setCatalogoHerramientas(result.catalogoHerramientas ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!profile?.tenant_id) return
    supabase.from('integraciones_ia').select('id, proveedor, modelo_default, activo')
      .eq('tenant_id', profile.tenant_id).eq('activo', true)
      .then(({ data }) => setIntegraciones((data as Integracion[]) ?? []))
  }, [profile?.tenant_id, supabase])

  const toggleActivo = async (a: Agente) => {
    await fetch(`/api/admin/agentes-ia/${a.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !a.activo }),
    })
    cargar()
  }

  const eliminar = async (a: Agente) => {
    if (!confirm(`¿Eliminar el agente "${a.nombre}"? Esta acción no se puede deshacer.`)) return
    await fetch(`/api/admin/agentes-ia/${a.id}`, { method: 'DELETE' })
    cargar()
  }

  const abrirEjecuciones = async (a: Agente) => {
    setEjecucionesDe(a)
    setCargandoEjec(true)
    const r = await fetch(`/api/admin/agentes-ia/${a.id}/ejecuciones`)
    const result = await r.json()
    setEjecuciones(result.ejecuciones ?? [])
    setCargandoEjec(false)
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Agentes IA</h1>
          <p className="text-sm text-gray-500">Configuraciones reutilizables — personalidad, objetivo y herramientas — para usar en el nodo Acción de Flujos.</p>
        </div>
        {puedeEditar && (
          <button onClick={() => setEditando('new')}
            className="px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white rounded-xl text-sm font-semibold transition-colors">
            + Crear agente
          </button>
        )}
      </div>

      <div className="mt-5 space-y-2.5">
        {loading && [1, 2].map(i => <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-gray-100" />)}

        {!loading && agentes.length === 0 && (
          <div className="text-center py-14 text-gray-400 text-sm">
            Todavía no has creado ningún agente.
          </div>
        )}

        {!loading && agentes.map(a => (
          <div key={a.id} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center text-lg flex-shrink-0">✨</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800">{a.nombre}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${a.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {a.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  {a.descripcion && <p className="text-xs text-gray-500 mt-0.5">{a.descripcion}</p>}
                  {a.herramientas_habilitadas.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {a.herramientas_habilitadas.map(h => (
                        <span key={h} className="text-[10px] bg-violet-50 text-violet-600 rounded-full px-2 py-0.5">{h}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => abrirEjecuciones(a)} title="Ver ejecuciones recientes"
                  className="text-gray-400 hover:text-violet-600 p-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l7 4v9M9 19H4v-9l5-3m0 12h7m-7-9v9" />
                  </svg>
                </button>
                {puedeEditar && (
                  <>
                    <button onClick={() => toggleActivo(a)} title={a.activo ? 'Desactivar' : 'Activar'} className="text-gray-400 hover:text-amber-600 p-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </button>
                    <button onClick={() => setEditando(a)} title="Editar" className="text-gray-400 hover:text-blue-600 p-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => eliminar(a)} title="Eliminar" className="text-gray-400 hover:text-red-600 p-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <ModalEditarAgente
          agente={editando === 'new' ? null : editando}
          integraciones={integraciones}
          catalogoHerramientas={catalogoHerramientas}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); cargar() }}
        />
      )}

      {ejecucionesDe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-sm">Ejecuciones recientes — {ejecucionesDe.nombre}</h2>
              <button onClick={() => setEjecucionesDe(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {cargandoEjec && <p className="text-sm text-gray-400 text-center py-6">Cargando...</p>}
              {!cargandoEjec && ejecuciones.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Sin ejecuciones registradas todavía.</p>}
              {!cargandoEjec && ejecuciones.map(e => (
                <div key={e.id} className={`border rounded-lg p-3 text-xs ${e.exitoso ? 'border-gray-200' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-600">
                      {e.herramienta_invocada ? `🔧 ${e.herramienta_invocada}` : '💬 Respuesta'}
                    </span>
                    <span className="text-gray-400">{formatFecha(e.created_at)} · {e.duracion_ms ?? 0}ms</span>
                  </div>
                  {e.mensaje_entrada && <p className="text-gray-500 mb-1">Cliente: &quot;{e.mensaje_entrada.slice(0, 150)}&quot;</p>}
                  {e.respuesta_texto && <p className="text-gray-800">{e.respuesta_texto.slice(0, 300)}</p>}
                  {e.parametros_herramienta ? <p className="text-gray-500 font-mono mt-1">{JSON.stringify(e.parametros_herramienta)}</p> : null}
                  {!e.exitoso && e.error_mensaje && <p className="text-red-600 mt-1">⚠ {e.error_mensaje}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModalEditarAgente({ agente, integraciones, catalogoHerramientas, onClose, onSaved }: {
  agente: Agente | null
  integraciones: Integracion[]
  catalogoHerramientas: HerramientaInfo[]
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(agente?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(agente?.descripcion ?? '')
  const [promptSistema, setPromptSistema] = useState(agente?.prompt_sistema ?? '')
  const [instrucciones, setInstrucciones] = useState(agente?.instrucciones ?? '')
  const [integracionId, setIntegracionId] = useState(agente?.integracion_ia_id ?? integraciones[0]?.id ?? '')
  const [modelo, setModelo] = useState(agente?.modelo ?? '')
  const [herramientas, setHerramientas] = useState<Set<string>>(new Set(agente?.herramientas_habilitadas ?? []))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const integracionActual = integraciones.find(i => i.id === integracionId)
  const modelosDisponibles = MODELOS_AGENTE[(integracionActual?.proveedor ?? '').toUpperCase()] ?? []

  const toggleHerramienta = (nombreH: string) => setHerramientas(hs => {
    const next = new Set(hs)
    if (next.has(nombreH)) next.delete(nombreH); else next.add(nombreH)
    return next
  })

  const guardar = async () => {
    if (!nombre.trim()) { setError('Falta el nombre del agente'); return }
    if (!integracionId) { setError('Selecciona una integración de IA'); return }
    setGuardando(true); setError('')
    const body = {
      nombre, descripcion, prompt_sistema: promptSistema, instrucciones,
      integracion_ia_id: integracionId, modelo: modelo || null, herramientas_habilitadas: [...herramientas],
    }
    const r = agente
      ? await fetch(`/api/admin/agentes-ia/${agente.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/admin/agentes-ia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await r.json()
    setGuardando(false)
    if (!r.ok) { setError(result.error ?? 'Error al guardar'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="font-bold text-gray-900 text-base">{agente ? 'Editar agente' : 'Nuevo agente'}</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="px-5 overflow-y-auto flex-1 min-h-0 space-y-3 pb-3">
          <div>
            <label className={labelCls}>Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Asesor de ventas MotoSpace" className={inputCls} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Descripción corta (opcional)</label>
            <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Para qué sirve este agente" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>¿Qué IA usa?</label>
            <select value={integracionId} onChange={e => setIntegracionId(e.target.value)} className={inputCls}>
              <option value="">Seleccionar integración conectada...</option>
              {integraciones.map(i => <option key={i.id} value={i.id}>{i.proveedor} ({i.modelo_default ?? 'modelo por defecto'})</option>)}
            </select>
            {!integraciones.length && <p className="text-[11px] text-amber-600 mt-1">⚠ Conecta un proveedor en Integraciones → Integraciones IA primero.</p>}
          </div>
          {modelosDisponibles.length > 0 && (
            <div>
              <label className={labelCls}>Modelo</label>
              <select value={modelo} onChange={e => setModelo(e.target.value)} className={inputCls}>
                <option value="">Por defecto de la integración ({integracionActual?.modelo_default ?? 'automático'})</option>
                {modelosDisponibles.map(m => <option key={m.modelo} value={m.modelo}>{m.label}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                {modelosDisponibles.find(m => m.modelo === modelo)?.ayuda ?? 'Elige un modelo económico por defecto; sube a uno más capaz solo si el agente comete errores de razonamiento.'}
              </p>
            </div>
          )}
          <div>
            <label className={labelCls}>Personalidad y objetivo (system prompt)</label>
            <textarea value={promptSistema} onChange={e => setPromptSistema(e.target.value)} rows={5}
              placeholder="Ej: Eres un asesor de ventas de MotoSpace38. Tu objetivo es siempre avanzar hacia el cierre de la venta. Si el cliente pide fotos, usa la herramienta correspondiente. Sé cordial y breve."
              className={`${inputCls} resize-none`} />
            <p className="text-[11px] text-gray-400 mt-1">Siempre se agrega automáticamente una regla fija: nunca prometer precios, fechas de entrega o crédito no confirmados en el sistema.</p>
          </div>
          <div>
            <label className={labelCls}>Reglas adicionales (opcional)</label>
            <textarea value={instrucciones} onChange={e => setInstrucciones(e.target.value)} rows={3}
              placeholder="Ej: Nunca discutas precios de la competencia. Si preguntan por repuestos, deriva a Servicio Técnico."
              className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Herramientas que puede usar</label>
            <div className="space-y-1.5 border border-gray-100 rounded-lg p-2.5 bg-gray-50">
              {catalogoHerramientas.map(h => (
                <label key={h.nombre} className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={herramientas.has(h.nombre)} onChange={() => toggleHerramienta(h.nombre)} />
                  <span>
                    <span className="font-mono font-semibold text-gray-700">{h.nombre}</span>
                    <span className="block text-gray-400">{h.descripcion}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 pt-3 border-t border-gray-100 flex-shrink-0" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
          <button onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50">Cancelar</button>
          <button onClick={guardar} disabled={guardando}
            className="flex-1 py-3 bg-violet-700 hover:bg-violet-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
