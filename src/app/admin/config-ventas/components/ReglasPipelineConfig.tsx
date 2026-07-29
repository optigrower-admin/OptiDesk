'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

type EtapaFlat = { id: string; label: string; pipelineNombre: string; grupoNombre: string; color: string }

type Regla = {
  id: string
  nombre: string
  etapa_origen_id: string
  etapa_destino_id: string
  dias_en_etapa: number
  activa: boolean
  ultima_corrida_at: string | null
}

type DraftRegla = { nombre: string; etapa_origen_id: string; etapa_destino_id: string; dias_en_etapa: number }

const DRAFT_VACIO: DraftRegla = { nombre: '', etapa_origen_id: '', etapa_destino_id: '', dias_en_etapa: 1 }

async function llamar(body: Record<string, unknown>) {
  const res = await fetch('/api/admin/ventas/reglas-pipeline', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Error')
  return json
}

function EtapaSelect({ etapas, value, onChange, placeholder }: {
  etapas: EtapaFlat[]; value: string; onChange: (v: string) => void; placeholder: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0">
      <option value="">{placeholder}</option>
      {etapas.map(e => (
        <option key={e.id} value={e.id}>{e.pipelineNombre} · {e.grupoNombre} · {e.label}</option>
      ))}
    </select>
  )
}

export default function ReglasPipelineConfig() {
  const [etapas, setEtapas]     = useState<EtapaFlat[]>([])
  const [reglas, setReglas]     = useState<Regla[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  const [creando, setCreando]   = useState(false)
  const [draft, setDraft]       = useState<DraftRegla>(DRAFT_VACIO)
  const [editId, setEditId]     = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<DraftRegla>(DRAFT_VACIO)

  const etapaPorId = useMemo(() => Object.fromEntries(etapas.map(e => [e.id, e])), [etapas])

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [resPipelines, resReglas] = await Promise.all([
        fetch('/api/admin/ventas/pipelines'),
        fetch('/api/admin/ventas/reglas-pipeline'),
      ])
      const jsonPipelines = await resPipelines.json()
      const jsonReglas = await resReglas.json()
      if (!resPipelines.ok) throw new Error(jsonPipelines.error ?? 'Error al cargar pipelines')
      if (!resReglas.ok) throw new Error(jsonReglas.error ?? 'Error al cargar reglas')

      const flat: EtapaFlat[] = []
      for (const p of jsonPipelines.pipelines ?? []) {
        for (const g of p.grupos ?? []) {
          for (const e of g.etapas ?? []) {
            flat.push({ id: e.id, label: e.label, pipelineNombre: p.nombre, grupoNombre: g.nombre, color: e.color })
          }
        }
      }
      setEtapas(flat)
      setReglas(jsonReglas.reglas ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function accionar(fn: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await fn(); await cargar() }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setBusy(false) }
  }

  const crear = () => accionar(async () => {
    if (!draft.nombre.trim() || !draft.etapa_origen_id || !draft.etapa_destino_id) return
    await llamar({ accion: 'crear', ...draft })
    setDraft(DRAFT_VACIO); setCreando(false)
  })

  const guardarEdicion = () => accionar(async () => {
    if (!editId) return
    await llamar({ accion: 'editar', regla_id: editId, ...editDraft })
    setEditId(null)
  })

  const toggleActiva = (r: Regla) => accionar(() => llamar({ accion: 'editar', regla_id: r.id, activa: !r.activa }))

  const eliminar = (r: Regla) => {
    if (!confirm(`¿Eliminar la regla "${r.nombre}"? Esta acción no se puede deshacer.`)) return
    accionar(() => llamar({ accion: 'eliminar', regla_id: r.id }))
  }

  if (loading) return <div className="p-5 text-sm text-gray-400">Cargando…</div>

  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-gray-500">
        Mueve clientes automáticamente de una etapa a otra (incluso entre pipelines distintos) cuando llevan
        cierta cantidad de días sin moverse. Se evalúa una vez al día. Si la etapa destino requiere aprobación
        de gerencia, el cliente se queda quieto hasta que se apruebe.
      </p>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {reglas.length === 0 && !creando && (
        <p className="text-sm text-gray-400 italic">No hay automatizaciones creadas aún.</p>
      )}

      <div className="space-y-2">
        {reglas.map(r => {
          const origen = etapaPorId[r.etapa_origen_id]
          const destino = etapaPorId[r.etapa_destino_id]
          return (
            <div key={r.id} className="border border-gray-200 rounded-xl p-3">
              {editId === r.id ? (
                <div className="space-y-2">
                  <input value={editDraft.nombre} onChange={e => setEditDraft({ ...editDraft, nombre: e.target.value })}
                    placeholder="Nombre de la regla"
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" autoFocus />
                  <div className="flex items-center gap-2 flex-wrap">
                    <EtapaSelect etapas={etapas} value={editDraft.etapa_origen_id} onChange={v => setEditDraft({ ...editDraft, etapa_origen_id: v })} placeholder="Etapa origen" />
                    <span className="text-gray-400 text-xs flex-shrink-0">después de</span>
                    <input type="number" min={0} value={editDraft.dias_en_etapa}
                      onChange={e => setEditDraft({ ...editDraft, dias_en_etapa: Number(e.target.value) })}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center flex-shrink-0" />
                    <span className="text-gray-400 text-xs flex-shrink-0">días →</span>
                    <EtapaSelect etapas={etapas} value={editDraft.etapa_destino_id} onChange={v => setEditDraft({ ...editDraft, etapa_destino_id: v })} placeholder="Etapa destino" />
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={guardarEdicion} className="flex-1 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold">Guardar</button>
                    <button onClick={() => setEditId(null)} className="flex-1 py-1.5 bg-gray-200 rounded-lg text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${r.activa ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{r.nombre}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-xs flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-white font-medium" style={{ background: origen?.color ?? '#9CA3AF' }}>
                        {origen ? origen.label : '—'}
                      </span>
                      <span className="text-gray-400">después de {r.dias_en_etapa} día{r.dias_en_etapa !== 1 ? 's' : ''} →</span>
                      <span className="px-2 py-0.5 rounded-full text-white font-medium" style={{ background: destino?.color ?? '#9CA3AF' }}>
                        {destino ? destino.label : '—'}
                      </span>
                    </div>
                    {r.ultima_corrida_at && (
                      <p className="text-[10px] text-gray-400 mt-1">Última corrida: {new Date(r.ultima_corrida_at).toLocaleString('es-CO')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => toggleActiva(r)} disabled={busy}
                      className={`text-xs px-2 py-1 rounded-full font-semibold ${r.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.activa ? 'Activa' : 'Inactiva'}
                    </button>
                    <button onClick={() => { setEditId(r.id); setEditDraft({ nombre: r.nombre, etapa_origen_id: r.etapa_origen_id, etapa_destino_id: r.etapa_destino_id, dias_en_etapa: r.dias_en_etapa }) }}
                      className="text-xs text-blue-600 hover:underline">Editar</button>
                    <button onClick={() => eliminar(r)} className="text-xs text-red-500 hover:underline">Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {creando ? (
        <div className="border border-dashed border-gray-300 rounded-xl p-3 space-y-2">
          <input value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })}
            placeholder="Nombre de la regla (ej: Pasar a Post-Venta tras entrega)"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" autoFocus />
          <div className="flex items-center gap-2 flex-wrap">
            <EtapaSelect etapas={etapas} value={draft.etapa_origen_id} onChange={v => setDraft({ ...draft, etapa_origen_id: v })} placeholder="Etapa origen" />
            <span className="text-gray-400 text-xs flex-shrink-0">después de</span>
            <input type="number" min={0} value={draft.dias_en_etapa}
              onChange={e => setDraft({ ...draft, dias_en_etapa: Number(e.target.value) })}
              className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center flex-shrink-0" />
            <span className="text-gray-400 text-xs flex-shrink-0">días →</span>
            <EtapaSelect etapas={etapas} value={draft.etapa_destino_id} onChange={v => setDraft({ ...draft, etapa_destino_id: v })} placeholder="Etapa destino" />
          </div>
          <div className="flex gap-1.5">
            <button onClick={crear} disabled={!draft.nombre.trim() || !draft.etapa_origen_id || !draft.etapa_destino_id}
              className="flex-1 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40">Crear regla</button>
            <button onClick={() => { setCreando(false); setDraft(DRAFT_VACIO) }} className="flex-1 py-1.5 bg-gray-200 rounded-lg text-xs">Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreando(true)}
          className="w-full py-2.5 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl text-sm text-blue-600 hover:text-blue-800 font-medium">
          + Nueva automatización
        </button>
      )}
    </div>
  )
}
