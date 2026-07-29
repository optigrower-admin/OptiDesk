'use client'
import { useState, useEffect, useCallback } from 'react'

type Etapa = {
  id: string
  clave: string
  label: string
  color: string
  bg: string
  border: string
  orden: number
  es_activa: boolean
  es_lead: boolean
  es_etapa_inicial: boolean
  es_ganado: boolean
  es_perdido: boolean
  requiere_celular: boolean
  requiere_placa: boolean
  requiere_fecha_entrega: boolean
  requiere_carta_negociacion: boolean
  requiere_factura: boolean
  requiere_aprobacion_gerencia: boolean
}

type Grupo = { id: string; clave: string; nombre: string; color: string; orden: number; etapas: Etapa[] }
type Pipeline = { id: string; clave: string; nombre: string; orden: number; grupos: Grupo[] }

type FlagKey = 'es_activa' | 'es_lead' | 'es_etapa_inicial' | 'es_ganado' | 'es_perdido' |
  'requiere_celular' | 'requiere_placa' | 'requiere_fecha_entrega' | 'requiere_carta_negociacion' |
  'requiere_factura' | 'requiere_aprobacion_gerencia'

const FLAGS: { key: FlagKey; label: string; hint: string }[] = [
  { key: 'es_activa',                   label: 'Activa',                     hint: 'Cuenta como lead en gestión (vistas Hoy/Bandeja/Resumen)' },
  { key: 'es_lead',                     label: 'Es lead',                    hint: 'Aparece en el conteo de leads' },
  { key: 'es_etapa_inicial',            label: 'Etapa inicial',              hint: 'Acá caen los clientes cuando escriben por primera vez' },
  { key: 'es_ganado',                   label: 'Marca venta ganada',         hint: 'Registra la fecha de cierre' },
  { key: 'es_perdido',                  label: 'Marca venta perdida',        hint: 'Registra la fecha de cierre' },
  { key: 'requiere_celular',            label: 'Exige celular',              hint: 'Alerta si el cliente no tiene celular' },
  { key: 'requiere_placa',              label: 'Exige placa',                hint: 'Alerta si la moto no tiene placa asignada' },
  { key: 'requiere_fecha_entrega',      label: 'Exige fecha de entrega',     hint: '' },
  { key: 'requiere_carta_negociacion',  label: 'Exige carta de negociación', hint: '' },
  { key: 'requiere_factura',            label: 'Exige número de factura',    hint: '' },
  { key: 'requiere_aprobacion_gerencia',label: 'Requiere aprobación de gerencia', hint: 'Bloquea el avance hasta que gerencia apruebe' },
]

type EtapaDraft = Pick<Etapa,
  'label' | 'color' | 'bg' | 'border' | 'es_activa' | 'es_lead' | 'es_etapa_inicial' | 'es_ganado' | 'es_perdido' |
  'requiere_celular' | 'requiere_placa' | 'requiere_fecha_entrega' | 'requiere_carta_negociacion' |
  'requiere_factura' | 'requiere_aprobacion_gerencia'
>

const DRAFT_VACIO: EtapaDraft = {
  label: '', color: '#2563EB', bg: 'bg-blue-50', border: 'border-blue-500',
  es_activa: true, es_lead: false, es_etapa_inicial: false, es_ganado: false, es_perdido: false,
  requiere_celular: false, requiere_placa: false, requiere_fecha_entrega: false,
  requiere_carta_negociacion: false, requiere_factura: false, requiere_aprobacion_gerencia: false,
}

async function llamar(body: Record<string, unknown>) {
  const res = await fetch('/api/admin/ventas/pipelines', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Error')
  return json
}

function EtapaForm({ draft, onChange }: { draft: EtapaDraft; onChange: (d: EtapaDraft) => void }) {
  return (
    <div className="space-y-2 bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <input type="color" value={draft.color} onChange={e => onChange({ ...draft, color: e.target.value })}
          className="w-9 h-9 rounded-lg cursor-pointer border border-gray-200 p-0.5" title="Color" />
        <input value={draft.label} onChange={e => onChange({ ...draft, label: e.target.value })}
          placeholder="Nombre de la etapa (ej: Prueba de manejo)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {FLAGS.map(f => (
          <label key={f.key} className="flex items-start gap-1.5 text-xs text-gray-600 cursor-pointer" title={f.hint}>
            <input type="checkbox" checked={draft[f.key]}
              onChange={e => onChange({ ...draft, [f.key]: e.target.checked })}
              className="mt-0.5 flex-shrink-0" />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  )
}

export default function PipelinesConfig() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  const [nuevoPipelineNombre, setNuevoPipelineNombre] = useState('')
  const [creandoPipeline, setCreandoPipeline]         = useState(false)

  const [nuevoGrupo, setNuevoGrupo]   = useState<{ pipelineId: string; nombre: string; color: string } | null>(null)
  const [nuevaEtapa, setNuevaEtapa]   = useState<{ pipelineId: string; grupoId: string; draft: EtapaDraft } | null>(null)
  const [editEtapa, setEditEtapa]     = useState<{ id: string; draft: EtapaDraft } | null>(null)
  const [editPipelineNombre, setEditPipelineNombre] = useState<{ id: string; nombre: string } | null>(null)
  const [editGrupo, setEditGrupo]     = useState<{ id: string; nombre: string; color: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ventas/pipelines')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al cargar')
      setPipelines(json.pipelines ?? [])
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

  const crearPipeline = () => accionar(async () => {
    if (!nuevoPipelineNombre.trim()) return
    await llamar({ accion: 'crear_pipeline', nombre: nuevoPipelineNombre })
    setNuevoPipelineNombre(''); setCreandoPipeline(false)
  })

  const guardarNombrePipeline = () => accionar(async () => {
    if (!editPipelineNombre) return
    await llamar({ accion: 'editar_pipeline', pipeline_id: editPipelineNombre.id, nombre: editPipelineNombre.nombre })
    setEditPipelineNombre(null)
  })

  const eliminarPipeline = (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el pipeline "${nombre}"? Debe estar vacío (sin clientes en sus etapas).`)) return
    accionar(() => llamar({ accion: 'eliminar_pipeline', pipeline_id: id }))
  }

  const moverPipeline = (id: string, direccion: 'arriba' | 'abajo') =>
    accionar(() => llamar({ accion: 'mover_pipeline', pipeline_id: id, direccion }))

  const crearGrupo = () => accionar(async () => {
    if (!nuevoGrupo?.nombre.trim()) return
    await llamar({ accion: 'crear_grupo', pipeline_id: nuevoGrupo.pipelineId, nombre: nuevoGrupo.nombre, color: nuevoGrupo.color })
    setNuevoGrupo(null)
  })

  const guardarGrupo = () => accionar(async () => {
    if (!editGrupo) return
    await llamar({ accion: 'editar_grupo', grupo_id: editGrupo.id, nombre: editGrupo.nombre, color: editGrupo.color })
    setEditGrupo(null)
  })

  const eliminarGrupo = (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el grupo "${nombre}"? Debe estar vacío (sin etapas).`)) return
    accionar(() => llamar({ accion: 'eliminar_grupo', grupo_id: id }))
  }

  const moverGrupo = (id: string, direccion: 'arriba' | 'abajo') =>
    accionar(() => llamar({ accion: 'mover_grupo', grupo_id: id, direccion }))

  const crearEtapa = () => accionar(async () => {
    if (!nuevaEtapa?.draft.label.trim()) return
    await llamar({ accion: 'crear_etapa', pipeline_id: nuevaEtapa.pipelineId, grupo_id: nuevaEtapa.grupoId, ...nuevaEtapa.draft })
    setNuevaEtapa(null)
  })

  const guardarEtapa = () => accionar(async () => {
    if (!editEtapa) return
    await llamar({ accion: 'editar_etapa', etapa_id: editEtapa.id, ...editEtapa.draft })
    setEditEtapa(null)
  })

  const eliminarEtapa = (id: string, label: string) => {
    if (!confirm(`¿Eliminar la etapa "${label}"? Debe estar vacía (sin clientes).`)) return
    accionar(() => llamar({ accion: 'eliminar_etapa', etapa_id: id }))
  }

  const moverEtapa = (id: string, direccion: 'arriba' | 'abajo') =>
    accionar(() => llamar({ accion: 'mover_etapa', etapa_id: id, direccion }))

  if (loading) return <div className="p-5 text-sm text-gray-400">Cargando pipelines…</div>

  return (
    <div className="p-5 space-y-4">
      <p className="text-xs text-gray-500">
        Configura tus propios pipelines, grupos de columnas y etapas para el Kanban de Seguimiento de Clientes.
        Una etapa con clientes activos no se puede eliminar hasta moverlos o cerrarlos.
      </p>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {pipelines.map((p, pIdx) => (
        <div key={p.id} className="border border-gray-200 rounded-xl overflow-hidden">
          {/* Header del pipeline */}
          <div className="flex items-center gap-2 bg-gray-50 px-4 py-3 border-b border-gray-200">
            <div className="flex flex-col gap-0.5">
              <button disabled={busy || pIdx === 0} onClick={() => moverPipeline(p.id, 'arriba')}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none">▲</button>
              <button disabled={busy || pIdx === pipelines.length - 1} onClick={() => moverPipeline(p.id, 'abajo')}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none">▼</button>
            </div>
            {editPipelineNombre?.id === p.id ? (
              <>
                <input value={editPipelineNombre.nombre}
                  onChange={e => setEditPipelineNombre({ id: p.id, nombre: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && guardarNombrePipeline()}
                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-bold" autoFocus />
                <button onClick={guardarNombrePipeline} className="text-xs px-3 py-1.5 bg-blue-700 text-white rounded-lg font-semibold">Guardar</button>
                <button onClick={() => setEditPipelineNombre(null)} className="text-xs px-3 py-1.5 bg-gray-200 rounded-lg">Cancelar</button>
              </>
            ) : (
              <>
                <span className="font-bold text-gray-900 flex-1">{p.nombre}</span>
                <button onClick={() => setEditPipelineNombre({ id: p.id, nombre: p.nombre })} className="text-xs text-blue-600 hover:underline">Renombrar</button>
                <button onClick={() => eliminarPipeline(p.id, p.nombre)} className="text-xs text-red-500 hover:underline">Eliminar</button>
              </>
            )}
          </div>

          <div className="p-4 space-y-3">
            {p.grupos.map((g, gIdx) => (
              <div key={g.id} className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2" style={{ background: `${g.color}15` }}>
                  <div className="flex flex-col gap-0.5">
                    <button disabled={busy || gIdx === 0} onClick={() => moverGrupo(g.id, 'arriba')}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-[10px] leading-none">▲</button>
                    <button disabled={busy || gIdx === p.grupos.length - 1} onClick={() => moverGrupo(g.id, 'abajo')}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-[10px] leading-none">▼</button>
                  </div>
                  {editGrupo?.id === g.id ? (
                    <>
                      <input type="color" value={editGrupo.color} onChange={e => setEditGrupo({ ...editGrupo, color: e.target.value })}
                        className="w-7 h-7 rounded border-0 p-0 cursor-pointer" />
                      <input value={editGrupo.nombre} onChange={e => setEditGrupo({ ...editGrupo, nombre: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && guardarGrupo()}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm" autoFocus />
                      <button onClick={guardarGrupo} className="text-xs px-2 py-1 bg-blue-700 text-white rounded-lg">Guardar</button>
                      <button onClick={() => setEditGrupo(null)} className="text-xs px-2 py-1 bg-gray-200 rounded-lg">Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: g.color }} />
                      <span className="font-semibold text-sm text-gray-800 flex-1">{g.nombre}</span>
                      <button onClick={() => setEditGrupo({ id: g.id, nombre: g.nombre, color: g.color })} className="text-[11px] text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => eliminarGrupo(g.id, g.nombre)} className="text-[11px] text-red-500 hover:underline">Eliminar</button>
                    </>
                  )}
                </div>

                <div className="p-2 space-y-1.5">
                  {g.etapas.map((e, eIdx) => (
                    <div key={e.id}>
                      {editEtapa?.id === e.id ? (
                        <div className="space-y-1.5">
                          <EtapaForm draft={editEtapa.draft} onChange={d => setEditEtapa({ id: e.id, draft: d })} />
                          <div className="flex gap-1.5">
                            <button onClick={guardarEtapa} className="flex-1 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold">Guardar</button>
                            <button onClick={() => setEditEtapa(null)} className="flex-1 py-1.5 bg-gray-200 rounded-lg text-xs">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
                          <div className="flex flex-col gap-0.5">
                            <button disabled={busy || eIdx === 0} onClick={() => moverEtapa(e.id, 'arriba')}
                              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-[9px] leading-none">▲</button>
                            <button disabled={busy || eIdx === g.etapas.length - 1} onClick={() => moverEtapa(e.id, 'abajo')}
                              className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-[9px] leading-none">▼</button>
                          </div>
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
                          <span className="text-xs font-medium text-gray-800 flex-1 truncate">{e.label}</span>
                          <div className="flex gap-1 flex-wrap justify-end max-w-[40%]">
                            {e.es_etapa_inicial && <span className="text-[9px] bg-sky-100 text-sky-700 px-1.5 rounded-full">inicial</span>}
                            {e.es_ganado && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 rounded-full">ganado</span>}
                            {e.es_perdido && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 rounded-full">perdido</span>}
                            {e.requiere_aprobacion_gerencia && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 rounded-full">aprob. gerencia</span>}
                          </div>
                          <button onClick={() => setEditEtapa({
                            id: e.id,
                            draft: {
                              label: e.label, color: e.color, bg: e.bg, border: e.border,
                              es_activa: e.es_activa, es_lead: e.es_lead, es_etapa_inicial: e.es_etapa_inicial,
                              es_ganado: e.es_ganado, es_perdido: e.es_perdido,
                              requiere_celular: e.requiere_celular, requiere_placa: e.requiere_placa,
                              requiere_fecha_entrega: e.requiere_fecha_entrega,
                              requiere_carta_negociacion: e.requiere_carta_negociacion,
                              requiere_factura: e.requiere_factura, requiere_aprobacion_gerencia: e.requiere_aprobacion_gerencia,
                            },
                          })} className="text-[11px] text-blue-600 hover:underline flex-shrink-0">Editar</button>
                          <button onClick={() => eliminarEtapa(e.id, e.label)} className="text-[11px] text-red-500 hover:underline flex-shrink-0">Eliminar</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {nuevaEtapa?.grupoId === g.id ? (
                    <div className="space-y-1.5">
                      <EtapaForm draft={nuevaEtapa.draft} onChange={d => setNuevaEtapa({ ...nuevaEtapa, draft: d })} />
                      <div className="flex gap-1.5">
                        <button onClick={crearEtapa} disabled={!nuevaEtapa.draft.label.trim()}
                          className="flex-1 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40">Crear etapa</button>
                        <button onClick={() => setNuevaEtapa(null)} className="flex-1 py-1.5 bg-gray-200 rounded-lg text-xs">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setNuevaEtapa({ pipelineId: p.id, grupoId: g.id, draft: DRAFT_VACIO })}
                      className="w-full text-xs text-blue-600 hover:text-blue-800 border border-dashed border-gray-300 hover:border-blue-400 rounded-lg py-1.5">
                      + Añadir etapa
                    </button>
                  )}
                </div>
              </div>
            ))}

            {nuevoGrupo?.pipelineId === p.id ? (
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                <input type="color" value={nuevoGrupo.color} onChange={e => setNuevoGrupo({ ...nuevoGrupo, color: e.target.value })}
                  className="w-8 h-8 rounded border-0 p-0 cursor-pointer" />
                <input value={nuevoGrupo.nombre} onChange={e => setNuevoGrupo({ ...nuevoGrupo, nombre: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && crearGrupo()}
                  placeholder="Nombre del grupo (ej: Negociación)"
                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" autoFocus />
                <button onClick={crearGrupo} disabled={!nuevoGrupo.nombre.trim()}
                  className="px-3 py-1.5 bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-40">Crear</button>
                <button onClick={() => setNuevoGrupo(null)} className="px-3 py-1.5 bg-gray-200 rounded-lg text-xs">Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setNuevoGrupo({ pipelineId: p.id, nombre: '', color: '#2563EB' })}
                className="w-full text-xs text-blue-600 hover:text-blue-800 border border-dashed border-gray-300 hover:border-blue-400 rounded-lg py-2">
                + Añadir grupo de columnas
              </button>
            )}
          </div>
        </div>
      ))}

      {creandoPipeline ? (
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3 border border-dashed border-gray-300">
          <input value={nuevoPipelineNombre} onChange={e => setNuevoPipelineNombre(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && crearPipeline()}
            placeholder="Nombre del pipeline (ej: Pipeline Repuestos)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" autoFocus />
          <button onClick={crearPipeline} disabled={!nuevoPipelineNombre.trim()}
            className="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-40">Crear</button>
          <button onClick={() => { setCreandoPipeline(false); setNuevoPipelineNombre('') }} className="px-4 py-2 bg-gray-200 rounded-lg text-sm">Cancelar</button>
        </div>
      ) : (
        <button onClick={() => setCreandoPipeline(true)}
          className="w-full py-2.5 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl text-sm text-blue-600 hover:text-blue-800 font-medium">
          + Crear nuevo pipeline
        </button>
      )}
    </div>
  )
}
