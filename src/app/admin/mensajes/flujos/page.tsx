'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  MarkerType,
  type EdgeProps,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { TriggerNode, GenericNode, CondicionNode, DividirTraficoNode, MenuOpcionesNode } from './components/nodes/FlowNodeCard'
import AddNodeMenu from './components/AddNodeMenu'
import NodeInspector from './components/NodeInspector'
import { getDefaultData, type CatalogCtx, type CatalogItem, type Usuario, type Plantilla, type AgenteIA, type Etiqueta, type IntegracionIA } from './nodeCatalog'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Flujo = {
  id: string
  nombre: string
  descripcion: string | null
  trigger_tipo: string
  grupo: string
  nodos: { nodes: Node[]; edges: Edge[] } | null
  activo: boolean
  created_at: string
  updated_at: string
}

type MensajePrueba = { id: string; direccion: 'entrante' | 'saliente'; contenido: string | null; tipo: string; created_at: string }

// ─── Edge personalizado con botón de eliminar ─────────────────────────────────

function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, selected }: EdgeProps) {
  const { setEdges } = useReactFlow()
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const [hovered, setHovered] = useState(false)
  const visible = selected || hovered
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, strokeWidth: selected ? 2.5 : 2 }} />
      <EdgeLabelRenderer>
        <div
          style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <button
            onClick={() => setEdges(es => es.filter(e => e.id !== id))}
            title="Eliminar conexión"
            style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.15s, background 0.15s', pointerEvents: visible ? 'auto' : 'none' }}
            className="w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-500 hover:bg-red-500 hover:text-white hover:border-red-500 text-xs flex items-center justify-center shadow-sm"
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const EDGE_TYPES: EdgeTypes = { deletable: DeletableEdge }

// ─── Registro de tipos de nodo (tarjetas resumen — la edición vive en el panel lateral) ─
const NODE_TYPES: NodeTypes = {
  trigger:             TriggerNode,
  mensaje:             GenericNode,
  media:               GenericNode,
  plantilla:           GenericNode,
  ia_generar_texto:    GenericNode,
  condicion:           CondicionNode,
  dividir_trafico:     DividirTraficoNode,
  esperar:             GenericNode,
  ir_a_nodo:           GenericNode,
  fin:                 GenericNode,
  capturar_dato:       GenericNode,
  menu_opciones:       MenuOpcionesNode,
  accion_conversacion: GenericNode,
  subflujo:            GenericNode,
}

// ─── Editor de flujo (canvas principal) ──────────────────────────────────────

type EditorCtx = CatalogCtx

type EditorProps = {
  flujo: Flujo | null
  ctx: EditorCtx
  onClose: () => void
  onSaved: () => void
  tenantId: string
  grupoInicial: string
}

function FlowEditorCanvas({ flujo, ctx, onClose, onSaved, tenantId, grupoInicial }: EditorProps) {
  const supabase   = createClient()
  const rfWrapper  = useRef<HTMLDivElement>(null)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)

  const defaultTrigger: Node = {
    id: 'trigger-1', type: 'trigger',
    position: { x: 200, y: 60 },
    data: getDefaultData('trigger', ctx),
    deletable: false,
  }

  const parsed = flujo?.nodos
  const migratedEdges = (parsed?.edges ?? []).map(e => ({
    ...e,
    type: 'deletable',
    markerEnd: { type: MarkerType.ArrowClosed, color: (e.style as { stroke?: string })?.stroke ?? '#6366f1' },
  }))
  const [nodes, setNodes, onNodesChange] = useNodesState(parsed?.nodes ?? [defaultTrigger])
  const [edges, setEdges, onEdgesChange] = useEdgesState(migratedEdges)
  const [nombre,      setNombre]      = useState(flujo?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(flujo?.descripcion ?? '')
  const [activo,      setActivo]      = useState(flujo?.activo ?? false)
  const [saving,      setSaving]      = useState(false)
  const [showEjec,    setShowEjec]    = useState(false)
  const [ejecs,       setEjecs]       = useState<unknown[]>([])

  // Chat de prueba
  const [showChatPrueba, setShowChatPrueba] = useState(false)
  const [mensajesPrueba, setMensajesPrueba] = useState<MensajePrueba[]>([])
  const [inputPrueba, setInputPrueba]       = useState('')
  const [enviandoPrueba, setEnviandoPrueba] = useState(false)
  const [cargandoChatPrueba, setCargandoChatPrueba] = useState(false)
  const [estadoEjecucionPrueba, setEstadoEjecucionPrueba] = useState<{ estado: string; ultimo_error: string | null; proxima_ejecucion_at: string | null } | null>(null)

  // Inyectar datos del contexto en los nodos cuando cambia ctx
  useEffect(() => {
    if (!ctx.equipo.length && !ctx.plantillas.length && !ctx.agentes.length) return
    setNodes(ns => ns.map(n => {
      if (n.type === 'mensaje' || n.type === 'plantilla') return { ...n, data: { ...n.data, plantillas: ctx.plantillas } }
      if (n.type === 'ia_generar_texto') return { ...n, data: { ...n.data, agentes: ctx.agentes, integracionesIA: ctx.integracionesIA } }
      if (n.type === 'subflujo') return { ...n, data: { ...n.data, flujos_disponibles: ctx.flujos } }
      if (n.type === 'accion_conversacion') return { ...n, data: { ...n.data, equipo: ctx.equipo, etiquetas: ctx.etiquetas, flujos_disponibles: ctx.flujos } }
      return n
    }))
  }, [ctx])

  // Nodo seleccionado (panel lateral de edición)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const actualizarNodoSeleccionado = useCallback((patch: Record<string, unknown>) => {
    if (!selectedNodeId) return
    setNodes(ns => ns.map(n => n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n))
  }, [selectedNodeId, setNodes])

  const navegarNodo = useCallback((direccion: 'prev' | 'next') => {
    if (!selectedNodeId) return
    const ordenados = [...nodes].sort((a, b) => a.position.y - b.position.y)
    const idx = ordenados.findIndex(n => n.id === selectedNodeId)
    if (idx === -1) return
    const siguienteIdx = direccion === 'next' ? idx + 1 : idx - 1
    if (siguienteIdx < 0 || siguienteIdx >= ordenados.length) return
    setSelectedNodeId(ordenados[siguienteIdx].id)
  }, [selectedNodeId, nodes])

  const onConnect = useCallback(
    (c: Connection) => setEdges(es => addEdge({
      ...c,
      type: 'deletable',
      animated: true,
      style: { stroke: '#6366f1' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
    }, es)),
    [setEdges]
  )

  const agregarNodo = (item: CatalogItem) => {
    const y = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) + 160 : 220
    const id = `node-${Date.now()}`
    setNodes(ns => [...ns, { id, type: item.tipo, position: { x: 200, y }, data: getDefaultData(item.tipo, ctx, item.subtipo) }])
    setSelectedNodeId(id)
  }

  const guardar = async () => {
    if (!nombre.trim()) { alert('El flujo necesita un nombre'); return }
    if (!tenantId) { alert('Error: sin empresa asignada. Recarga la página.'); return }
    setSaving(true)
    const nodos = { nodes, edges }
    const triggerTipo = nodes.find(n => n.type === 'trigger')?.data?.trigger_tipo ?? 'mensaje_nuevo'
    try {
      if (flujo) {
        const { error } = await supabase.from('flujos_automatizacion').update({
          nombre, descripcion: descripcion || null, trigger_tipo: triggerTipo, nodos, activo,
          updated_at: new Date().toISOString(),
        }).eq('id', flujo.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('flujos_automatizacion').insert({
          tenant_id: tenantId, nombre, descripcion: descripcion || null,
          trigger_tipo: triggerTipo, nodos, activo, grupo: grupoInicial,
        })
        if (error) throw error
      }
      onSaved()
    } catch (e) {
      const msg = (e as { message?: string }).message ?? String(e)
      console.error('[guardar flujo]', e)
      alert(`Error al guardar el flujo:\n${msg}`)
    } finally { setSaving(false) }
  }

  const cargarEjecuciones = async () => {
    if (!flujo) return
    setShowEjec(true)
    const { data } = await supabase
      .from('flujo_ejecuciones')
      .select('id, estado, nodo_actual_id, pasos_ejecutados, proxima_ejecucion_at, ultimo_error, created_at, updated_at, conversaciones(canal, canal_contact_id, clientes(nombre))')
      .eq('flujo_id', flujo.id)
      .order('updated_at', { ascending: false })
      .limit(20)
    setEjecs(data ?? [])
  }

  const abrirChatPrueba = async () => {
    if (!flujo) return
    setShowChatPrueba(true)
    setCargandoChatPrueba(true)
    try {
      const r = await fetch('/api/admin/flujos/chat-prueba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flujo_id: flujo.id, accion: 'historial' }),
      })
      const result = await r.json()
      setMensajesPrueba(result.mensajes ?? [])
    } finally {
      setCargandoChatPrueba(false)
    }
  }

  const enviarMensajePrueba = async () => {
    if (!flujo || !inputPrueba.trim() || enviandoPrueba) return
    const texto = inputPrueba.trim()
    setInputPrueba('')
    setEnviandoPrueba(true)
    setMensajesPrueba(p => [...p, { id: `tmp-${Date.now()}`, direccion: 'entrante', contenido: texto, tipo: 'texto', created_at: new Date().toISOString() }])
    try {
      const r = await fetch('/api/admin/flujos/chat-prueba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flujo_id: flujo.id, accion: 'mensaje', texto }),
      })
      const result = await r.json()
      if (!r.ok) { alert(result.error ?? 'Error al probar el flujo'); return }
      setMensajesPrueba(p => [...p, ...(result.respuestas ?? [])])
      setEstadoEjecucionPrueba(result.estado_ejecucion ?? null)
    } catch {
      alert('No se pudo conectar para probar el flujo')
    } finally {
      setEnviandoPrueba(false)
    }
  }

  const reiniciarChatPrueba = async () => {
    if (!flujo) return
    if (!confirm('¿Reiniciar la conversación de prueba desde cero?')) return
    setCargandoChatPrueba(true)
    try {
      await fetch('/api/admin/flujos/chat-prueba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flujo_id: flujo.id, accion: 'reiniciar' }),
      })
      setMensajesPrueba([])
      setEstadoEjecucionPrueba(null)
    } finally {
      setCargandoChatPrueba(false)
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del flujo..."
          className="flex-1 max-w-xs border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción (opcional)"
          className="flex-1 max-w-sm border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} className="w-4 h-4 rounded text-green-600" />
          <span className={activo ? 'text-green-700 font-medium' : 'text-gray-500'}>Activo</span>
        </label>
        {flujo && (
          <button onClick={cargarEjecuciones} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
            📊 Ejecuciones
          </button>
        )}
        {flujo && (
          <button onClick={abrirChatPrueba} className="px-3 py-1.5 border border-fuchsia-200 bg-fuchsia-50 rounded-lg text-xs text-fuchsia-700 hover:bg-fuchsia-100 transition-colors">
            💬 Probar flujo
          </button>
        )}
        <AddNodeMenu onSelect={agregarNodo} />
        <button onClick={guardar} disabled={saving}
          className="px-4 py-1.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
          {saving ? 'Guardando...' : 'Guardar flujo'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas React Flow */}
        <div ref={rfWrapper} className="flex-1 bg-gray-50">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onInit={setRfInstance}
            onNodeClick={onNodeClick} onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES} fitView
            deleteKeyCode={['Delete', 'Backspace']} snapToGrid snapGrid={[16, 16]}
            defaultEdgeOptions={{
              type: 'deletable',
              animated: true,
              style: { stroke: '#6366f1' },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
            }}>
            <Background color="#e5e7eb" gap={16} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} pannable zoomable className="!bg-white !border-gray-200" />
          </ReactFlow>
        </div>

        {/* Panel lateral de edición del nodo seleccionado */}
        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            ctx={ctx}
            allNodes={nodes}
            onChange={actualizarNodoSeleccionado}
            onClose={() => setSelectedNodeId(null)}
            onPrev={() => navegarNodo('prev')}
            onNext={() => navegarNodo('next')}
          />
        )}
      </div>

      {/* Panel de ejecuciones */}
      {showEjec && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowEjec(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-900">Ejecuciones de este flujo</h3>
              <button onClick={() => setShowEjec(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
              {(ejecs as Record<string, unknown>[]).map(e => {
                const conv = e.conversaciones as Record<string, unknown> | null
                const clientes = conv?.clientes as Record<string, unknown>[] | null
                const nombre_cli = clientes?.[0]?.nombre as string ?? conv?.canal_contact_id as string ?? 'Desconocido'
                return (
                  <div key={e.id as string} className="border border-gray-200 rounded-xl p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{nombre_cli}</span>
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        e.estado === 'completado' ? 'bg-green-100 text-green-700'
                        : e.estado === 'activo' ? 'bg-blue-100 text-blue-700'
                        : e.estado === 'error' ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                      }`}>{String(e.estado)}</span>
                    </div>
                    <p className="text-gray-500">Nodo actual: {String(e.nodo_actual_id ?? '—')} · Pasos: {String(e.pasos_ejecutados)}</p>
                    {!!(e.ultimo_error) && <p className="text-red-500 mt-1">Error: {String(e.ultimo_error)}</p>}
                    {!!(e.proxima_ejecucion_at) && <p className="text-orange-600 mt-1">Próxima ejecución: {new Date(String(e.proxima_ejecucion_at)).toLocaleString('es-CO')}</p>}
                  </div>
                )
              })}
              {ejecs.length === 0 && <p className="text-center text-gray-400 py-8">Sin ejecuciones aún</p>}
            </div>
          </div>
        </div>
      )}

      {showChatPrueba && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowChatPrueba(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm h-[600px] max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">💬 Chat de prueba</h3>
                <p className="text-[10px] text-gray-400">Escribe como si fueras el cliente — no se envía nada real por WhatsApp.</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={reiniciarChatPrueba} title="Reiniciar desde cero" className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">
                  🗑
                </button>
                <button onClick={() => setShowChatPrueba(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
              {cargandoChatPrueba ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-fuchsia-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : mensajesPrueba.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">Escribe un mensaje abajo para empezar a probar el flujo.</p>
              ) : (
                mensajesPrueba.map(m => (
                  <div key={m.id} className={`flex ${m.direccion === 'entrante' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${
                      m.direccion === 'entrante' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
                    }`}>
                      {m.tipo === 'nota_interna' && <p className="text-[9px] opacity-70 mb-0.5">📝 nota interna</p>}
                      <p className="whitespace-pre-wrap">{m.contenido || '(sin contenido)'}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {estadoEjecucionPrueba?.proxima_ejecucion_at && (
              <p className="text-[10px] text-amber-600 bg-amber-50 border-t border-amber-100 px-3 py-1.5">
                ⏸ El flujo está en pausa (esperando tiempo o respuesta) hasta {new Date(estadoEjecucionPrueba.proxima_ejecucion_at).toLocaleString('es-CO')}.
              </p>
            )}
            {estadoEjecucionPrueba?.ultimo_error && (
              <p className="text-[10px] text-red-600 bg-red-50 border-t border-red-100 px-3 py-1.5">
                ⚠ {estadoEjecucionPrueba.ultimo_error}
              </p>
            )}

            <div className="p-3 border-t border-gray-100 flex-shrink-0 flex items-center gap-2">
              <input
                value={inputPrueba}
                onChange={e => setInputPrueba(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') enviarMensajePrueba() }}
                placeholder="Escribe como el cliente..."
                disabled={enviandoPrueba}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
              />
              <button onClick={enviarMensajePrueba} disabled={!inputPrueba.trim() || enviandoPrueba}
                className="px-3 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors">
                {enviandoPrueba ? '...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FlowEditor(props: EditorProps) {
  return (
    <ReactFlowProvider>
      <FlowEditorCanvas {...props} />
    </ReactFlowProvider>
  )
}

// ─── Vista de lista de flujos ─────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  mensaje_nuevo:     '📱 Mensaje nuevo',
  lead_ad:           '📣 Lead de anuncio',
  sin_respuesta_24h: '⏰ Sin respuesta 24h',
  etapa_cambiada:    '📊 Etapa cambiada',
  nuevo_cliente:     '👤 Cliente nuevo',
}

export default function FlujoPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [flujos,   setFlujos]   = useState<Flujo[]>([])
  const [ctx,      setCtx]      = useState<EditorCtx>({ equipo: [], plantillas: [], agentes: [], flujos: [], etiquetas: [], integracionesIA: [] })
  const [loading,  setLoading]  = useState(true)
  const [editando, setEditando] = useState<Flujo | null | 'new'>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [tab, setTab] = useState<'mensajeria' | 'automatizaciones'>('mensajeria')

  const cargar = useCallback(async () => {
    if (!profile?.tenant_id) return
    setLoading(true)
    const { data } = await supabase
      .from('flujos_automatizacion')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
    setFlujos((data as Flujo[]) ?? [])
    setLoading(false)
  }, [profile?.tenant_id])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!profile?.tenant_id) return
    Promise.all([
      supabase.from('usuarios').select('id, nombre').eq('tenant_id', profile.tenant_id),
      supabase.from('plantillas_mensajes').select('id, nombre, meta_status, meta_template_name').eq('tenant_id', profile.tenant_id),
      supabase.from('agentes_ia').select('id, nombre, proveedor').eq('tenant_id', profile.tenant_id).eq('activo', true),
      supabase.from('flujos_automatizacion').select('id, nombre').eq('tenant_id', profile.tenant_id),
      supabase.from('etiquetas_venta').select('id, nombre, color').eq('tenant_id', profile.tenant_id).order('nombre'),
      supabase.from('integraciones_ia').select('id, proveedor, activo, uso_asignado').eq('tenant_id', profile.tenant_id),
    ]).then(([{ data: eq }, { data: pl }, { data: ag }, { data: fl }, { data: et }, { data: ia }]) => {
      setCtx({
        equipo:     (eq as Usuario[]) ?? [],
        plantillas: (pl as Plantilla[]) ?? [],
        agentes:    (ag as AgenteIA[]) ?? [],
        flujos:     ((fl as { id: string; nombre: string }[]) ?? []),
        etiquetas:  ((et as Etiqueta[]) ?? []),
        integracionesIA: (ia as IntegracionIA[]) ?? [],
      })
    })
  }, [profile?.tenant_id])

  const toggleActivo = async (flujo: Flujo) => {
    await supabase.from('flujos_automatizacion').update({ activo: !flujo.activo }).eq('id', flujo.id)
    setFlujos(fs => fs.map(f => f.id === flujo.id ? { ...f, activo: !f.activo } : f))
  }

  const eliminar = async (id: string) => {
    await supabase.from('flujos_automatizacion').delete().eq('id', id)
    setFlujos(fs => fs.filter(f => f.id !== id))
    setConfirmDel(null)
  }

  const onSaved = () => { setEditando(null); cargar() }

  if (editando !== null) {
    return (
      <FlowEditor
        flujo={editando === 'new' ? null : editando}
        ctx={ctx}
        onClose={() => setEditando(null)}
        onSaved={onSaved}
        tenantId={profile?.tenant_id ?? ''}
        grupoInicial={editando === 'new' ? tab : editando.grupo}
      />
    )
  }

  const flujosFiltrados = flujos.filter(f => (f.grupo ?? 'mensajeria') === tab)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Flujos de automatización</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define respuestas y acciones automáticas al recibir mensajes o leads</p>
        </div>
        {profile?.rol === 'gerencia' && (
          <button onClick={() => setEditando('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo flujo
          </button>
        )}
      </div>

      {/* Pestañas de grupo */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('mensajeria')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'mensajeria' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          💬 Mensajería
        </button>
        <button onClick={() => setTab('automatizaciones')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'automatizaciones' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          🔀 Automatizaciones
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-xs text-blue-800">
        {tab === 'mensajeria' ? (
          <>
            <p className="font-semibold mb-1">⚡ Cómo funcionan los flujos</p>
            <p>Cuando llega un mensaje de WhatsApp, Messenger o Instagram, el sistema detecta si hay un flujo activo con ese disparador y lo ejecuta automáticamente. Los <strong>delays</strong> se procesan cada minuto. Los <strong>Agentes IA</strong> requieren configurar las API keys en <em>Config Ventas → APIs IA</em>.</p>
          </>
        ) : (
          <>
            <p className="font-semibold mb-1">🔀 Automatizaciones de pipeline</p>
            <p>Arma reglas con los nodos de la categoría <strong>Pipeline / Automatización</strong> en la paleta: condiciones de etapa, aprobación pendiente, esperar días en una etapa, y cambiar de etapa — todo dentro del mismo motor de flujos, para que después puedas mezclarlas con mensajes, asignaciones, etc.</p>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : flujosFiltrados.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <span className="text-4xl block mb-3">{tab === 'mensajeria' ? '⚡' : '🔀'}</span>
          <h3 className="font-semibold text-gray-900 mb-1">
            {tab === 'mensajeria' ? 'Sin flujos de mensajería aún' : 'Sin automatizaciones aún'}
          </h3>
          <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">
            {tab === 'mensajeria'
              ? 'Crea tu primer flujo para automatizar respuestas y gestión de clientes.'
              : 'Crea tu primera automatización de pipeline: mover etapas, pedir datos o bloquear el avance según condiciones.'}
          </p>
          {profile?.rol === 'gerencia' && (
            <button onClick={() => setEditando('new')} className="px-5 py-2 bg-blue-700 text-white rounded-xl text-sm hover:bg-blue-800">
              {tab === 'mensajeria' ? 'Crear primer flujo' : 'Crear primera automatización'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {flujosFiltrados.map(flujo => {
            const nodosCount = flujo.nodos?.nodes?.length ?? 0
            return (
              <div key={flujo.id} className={`bg-white border rounded-xl p-4 flex items-center gap-4 hover:border-gray-300 transition-colors ${flujo.activo ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}>
                <button onClick={() => toggleActivo(flujo)}
                  className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${flujo.activo ? 'bg-green-500' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${flujo.activo ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-gray-900 truncate">{flujo.nombre}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${flujo.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {flujo.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    <span>{TRIGGER_LABELS[flujo.trigger_tipo] ?? flujo.trigger_tipo}</span>
                    {flujo.descripcion && <span className="truncate max-w-xs text-gray-400">{flujo.descripcion}</span>}
                    <span className="text-gray-400">{nodosCount} nodos</span>
                    <span className="text-gray-400">Editado {new Date(flujo.updated_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setEditando(flujo)}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Editar
                  </button>
                  {profile?.rol === 'gerencia' && (
                    <button onClick={() => setConfirmDel(flujo.id)}
                      className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal eliminar */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-gray-900 mb-2">¿Eliminar flujo?</h3>
            <p className="text-sm text-gray-600 mb-5">Esta acción no se puede deshacer. Las ejecuciones activas se cancelarán.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => eliminar(confirmDel)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
