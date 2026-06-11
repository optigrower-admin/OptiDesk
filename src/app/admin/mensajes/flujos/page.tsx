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
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
  type NodeProps,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Flujo = {
  id: string
  nombre: string
  descripcion: string | null
  trigger_tipo: string
  nodos: { nodes: Node[]; edges: Edge[] } | null
  activo: boolean
  created_at: string
  updated_at: string
}

type Usuario = { id: string; nombre: string }

// ─── Nodos personalizados ─────────────────────────────────────────────────────

const nodeBaseClass = 'rounded-xl shadow-md border-2 min-w-52 text-sm font-sans'

function NodeHeader({ color, icon, label }: { color: string; icon: string; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${color}`}>
      <span>{icon}</span>
      <span className="font-semibold text-white text-xs uppercase tracking-wide">{label}</span>
    </div>
  )
}

const TriggerNode = ({ id, data }: NodeProps) => {
  const { setNodes } = useReactFlow()
  const upd = (k: string, v: string) => setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))

  return (
    <div className={`${nodeBaseClass} border-blue-400 bg-white`}>
      <NodeHeader color="bg-blue-500" icon="⚡" label="Trigger" />
      <div className="px-3 py-2.5 space-y-2">
        <label className="block text-xs text-gray-500 font-medium">Disparador</label>
        <select
          defaultValue={data.trigger_tipo ?? 'mensaje_nuevo'}
          onChange={e => upd('trigger_tipo', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="mensaje_nuevo">Mensaje nuevo</option>
          <option value="lead_ad">Lead de anuncio</option>
          <option value="sin_respuesta_24h">Sin respuesta 24h</option>
        </select>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-3 !h-3" />
    </div>
  )
}

const MensajeNode = ({ id, data }: NodeProps) => {
  const { setNodes } = useReactFlow()
  const upd = (k: string, v: string) => setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))

  return (
    <div className={`${nodeBaseClass} border-green-400 bg-white`}>
      <Handle type="target" position={Position.Top} className="!bg-green-400 !w-3 !h-3" />
      <NodeHeader color="bg-green-500" icon="💬" label="Enviar mensaje" />
      <div className="px-3 py-2.5 space-y-2">
        <textarea
          defaultValue={data.contenido ?? ''}
          onChange={e => upd('contenido', e.target.value)}
          placeholder="Escribe el mensaje... usa {{nombre}} para variables"
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400 resize-none font-mono"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input
            type="checkbox"
            defaultChecked={data.usar_plantilla ?? false}
            onChange={e => upd('usar_plantilla', e.target.checked ? 'true' : 'false')}
            className="rounded"
          />
          Usar plantilla aprobada
        </label>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-400 !w-3 !h-3" />
    </div>
  )
}

const AsignarNode = ({ id, data }: NodeProps) => {
  const { setNodes } = useReactFlow()
  const upd = (k: string, v: string) => setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const equipo: Usuario[] = data.equipo ?? []

  return (
    <div className={`${nodeBaseClass} border-purple-400 bg-white`}>
      <Handle type="target" position={Position.Top} className="!bg-purple-400 !w-3 !h-3" />
      <NodeHeader color="bg-purple-500" icon="👤" label="Asignar asesor" />
      <div className="px-3 py-2.5 space-y-2">
        <label className="block text-xs text-gray-500 font-medium">Tipo de asignación</label>
        <select
          defaultValue={data.tipo_asignacion ?? 'round_robin'}
          onChange={e => upd('tipo_asignacion', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
        >
          <option value="round_robin">Round Robin (auto)</option>
          <option value="usuario_fijo">Usuario fijo</option>
        </select>
        {data.tipo_asignacion === 'usuario_fijo' && (
          <select
            defaultValue={data.asignar_a ?? ''}
            onChange={e => upd('asignar_a', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
          >
            <option value="">Seleccionar asesor...</option>
            {equipo.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400 !w-3 !h-3" />
    </div>
  )
}

const EsperarNode = ({ id, data }: NodeProps) => {
  const { setNodes } = useReactFlow()
  const upd = (k: string, v: string) => setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))

  return (
    <div className={`${nodeBaseClass} border-orange-400 bg-white`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-400 !w-3 !h-3" />
      <NodeHeader color="bg-orange-500" icon="⏱️" label="Esperar" />
      <div className="px-3 py-2.5 flex items-center gap-2">
        <input
          type="number"
          defaultValue={data.horas ?? 24}
          min={1}
          max={168}
          onChange={e => upd('horas', e.target.value)}
          className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <span className="text-xs text-gray-500">horas antes de continuar</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400 !w-3 !h-3" />
    </div>
  )
}

const EtapaNode = ({ id, data }: NodeProps) => {
  const { setNodes } = useReactFlow()
  const upd = (k: string, v: string) => setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))

  return (
    <div className={`${nodeBaseClass} border-cyan-400 bg-white`}>
      <Handle type="target" position={Position.Top} className="!bg-cyan-400 !w-3 !h-3" />
      <NodeHeader color="bg-cyan-500" icon="📊" label="Cambiar etapa" />
      <div className="px-3 py-2.5 space-y-2">
        <label className="block text-xs text-gray-500 font-medium">Nueva etapa de venta</label>
        <select
          defaultValue={data.etapa ?? 'calificado'}
          onChange={e => upd('etapa', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400"
        >
          {['nuevo','calificado','demo','propuesta','negociacion','ganado','perdido'].map(e => (
            <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
          ))}
        </select>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-400 !w-3 !h-3" />
    </div>
  )
}

const FinNode = (_: NodeProps) => (
  <div className={`${nodeBaseClass} border-gray-300 bg-white`}>
    <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-3 !h-3" />
    <div className="px-3 py-3 text-center">
      <span className="text-2xl">🏁</span>
      <p className="text-xs font-semibold text-gray-600 mt-1">Fin del flujo</p>
    </div>
  </div>
)

const NODE_TYPES: NodeTypes = { trigger: TriggerNode, mensaje: MensajeNode, asignar: AsignarNode, esperar: EsperarNode, etapa: EtapaNode, fin: FinNode }

// ─── Paleta de nodos ──────────────────────────────────────────────────────────

const PALETTE_ITEMS = [
  { type: 'mensaje',  icon: '💬', label: 'Enviar mensaje',  color: 'border-green-300 bg-green-50 hover:bg-green-100'  },
  { type: 'asignar',  icon: '👤', label: 'Asignar asesor',  color: 'border-purple-300 bg-purple-50 hover:bg-purple-100' },
  { type: 'esperar',  icon: '⏱️', label: 'Esperar',         color: 'border-orange-300 bg-orange-50 hover:bg-orange-100' },
  { type: 'etapa',    icon: '📊', label: 'Cambiar etapa',   color: 'border-cyan-300 bg-cyan-50 hover:bg-cyan-100'     },
  { type: 'fin',      icon: '🏁', label: 'Fin del flujo',   color: 'border-gray-300 bg-gray-50 hover:bg-gray-100'     },
]

function getDefaultData(type: string, equipo: Usuario[] = []): Record<string, unknown> {
  switch (type) {
    case 'trigger':  return { trigger_tipo: 'mensaje_nuevo' }
    case 'mensaje':  return { contenido: '', usar_plantilla: false }
    case 'asignar':  return { tipo_asignacion: 'round_robin', asignar_a: '', equipo }
    case 'esperar':  return { horas: 24 }
    case 'etapa':    return { etapa: 'calificado' }
    case 'fin':      return {}
    default:         return {}
  }
}

// ─── Editor de flujo (usa ReactFlow internamente) ─────────────────────────────

type EditorProps = {
  flujo: Flujo | null
  equipo: Usuario[]
  onClose: () => void
  onSaved: () => void
  tenantId: string
}

function FlowEditorCanvas({ flujo, equipo, onClose, onSaved, tenantId }: EditorProps) {
  const supabase = createClient()
  const rfWrapper = useRef<HTMLDivElement>(null)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)

  const defaultTrigger: Node = {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 180, y: 60 },
    data: getDefaultData('trigger', equipo),
    deletable: false,
  }

  const parsed = flujo?.nodos
  const [nodes, setNodes, onNodesChange] = useNodesState(parsed?.nodes ?? [defaultTrigger])
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed?.edges ?? [])

  const [nombre, setNombre]           = useState(flujo?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(flujo?.descripcion ?? '')
  const [activo, setActivo]           = useState(flujo?.activo ?? false)
  const [saving, setSaving]           = useState(false)

  // Inject equipo into asignar nodes
  useEffect(() => {
    if (!equipo.length) return
    setNodes(ns => ns.map(n => n.type === 'asignar' ? { ...n, data: { ...n.data, equipo } } : n))
  }, [equipo.length])

  const onConnect = useCallback(
    (c: Connection) => setEdges(es => addEdge({ ...c, type: 'smoothstep', animated: true, style: { stroke: '#6366f1' } }, es)),
    [setEdges]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow')
    if (!type || !rfInstance || !rfWrapper.current) return
    const bounds = rfWrapper.current.getBoundingClientRect()
    const position = rfInstance.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
    setNodes(ns => ns.concat({
      id: `node-${Date.now()}`,
      type,
      position,
      data: getDefaultData(type, equipo),
    }))
  }, [rfInstance, setNodes, equipo])

  const addNode = (type: string) => {
    const y = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) + 160 : 220
    setNodes(ns => ns.concat({
      id: `node-${Date.now()}`,
      type,
      position: { x: 180, y },
      data: getDefaultData(type, equipo),
    }))
  }

  const guardar = async () => {
    if (!nombre.trim()) { alert('El flujo necesita un nombre'); return }
    setSaving(true)
    const nodos = { nodes, edges }
    const triggerTipo = nodes.find(n => n.type === 'trigger')?.data?.trigger_tipo ?? 'mensaje_nuevo'

    try {
      if (flujo) {
        await supabase.from('flujos_automatizacion').update({
          nombre, descripcion: descripcion || null, trigger_tipo: triggerTipo, nodos, activo, updated_at: new Date().toISOString(),
        }).eq('id', flujo.id)
      } else {
        await supabase.from('flujos_automatizacion').insert({
          tenant_id: tenantId, nombre, descripcion: descripcion || null, trigger_tipo: triggerTipo, nodos, activo,
        })
      }
      onSaved()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
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
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Nombre del flujo..."
          className="flex-1 max-w-xs border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Descripción (opcional)"
          className="flex-1 max-w-sm border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} className="w-4 h-4 rounded text-green-600" />
          <span className={activo ? 'text-green-700 font-medium' : 'text-gray-500'}>Activo</span>
        </label>
        <button onClick={guardar} disabled={saving}
          className="px-4 py-1.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Paleta */}
        <div className="w-44 bg-white border-r border-gray-200 p-3 flex-shrink-0 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Nodos</p>
          <div className="space-y-1.5">
            {PALETTE_ITEMS.map(item => (
              <div
                key={item.type}
                draggable
                onDragStart={e => { e.dataTransfer.setData('application/reactflow', item.type); e.dataTransfer.effectAllowed = 'move' }}
                onClick={() => addNode(item.type)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${item.color}`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-xs font-medium text-gray-700">{item.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4 px-1 leading-relaxed">
            Arrastra o haz clic para agregar nodos al canvas. Conecta arrastrando entre los puntos.
          </p>
          <p className="text-xs text-gray-400 mt-2 px-1">
            <kbd className="bg-gray-100 px-1 rounded">Del</kbd> para eliminar nodos seleccionados.
          </p>
        </div>

        {/* Canvas */}
        <div ref={rfWrapper} className="flex-1 bg-gray-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={NODE_TYPES}
            fitView
            deleteKeyCode="Delete"
            snapToGrid
            snapGrid={[16, 16]}
            defaultEdgeOptions={{ type: 'smoothstep', animated: true, style: { stroke: '#6366f1' } }}
          >
            <Background color="#e5e7eb" gap={16} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} pannable zoomable className="!bg-white !border-gray-200" />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}

// Wrapper con ReactFlowProvider
function FlowEditor(props: EditorProps) {
  return (
    <ReactFlowProvider>
      <FlowEditorCanvas {...props} />
    </ReactFlowProvider>
  )
}

// ─── Vista de lista de flujos ─────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  mensaje_nuevo:     'Mensaje nuevo',
  lead_ad:           'Lead de anuncio',
  sin_respuesta_24h: 'Sin respuesta 24h',
}

export default function FlujoPage() {
  const { profile } = useAuth()
  const supabase = createClient()

  const [flujos, setFlujos]       = useState<Flujo[]>([])
  const [equipo, setEquipo]       = useState<Usuario[]>([])
  const [loading, setLoading]     = useState(true)
  const [editando, setEditando]   = useState<Flujo | null | 'new'>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

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
    supabase.from('usuarios').select('id, nombre').eq('tenant_id', profile.tenant_id)
      .then(({ data }) => setEquipo((data as Usuario[]) ?? []))
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

  // ── Modo editor ────────────────────────────────────────────────────────────
  if (editando !== null) {
    return (
      <FlowEditor
        flujo={editando === 'new' ? null : editando}
        equipo={equipo}
        onClose={() => setEditando(null)}
        onSaved={onSaved}
        tenantId={profile?.tenant_id ?? ''}
      />
    )
  }

  // ── Modo lista ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Flujos de automatización</h1>
          <p className="text-sm text-gray-500 mt-0.5">Define qué pasa cuando llega un mensaje o un lead</p>
        </div>
        {profile?.rol === 'gerencia' && (
          <button
            onClick={() => setEditando('new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo flujo
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : flujos.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚡</span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Sin flujos aún</h3>
          <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">
            Crea tu primer flujo de automatización para responder y gestionar conversaciones automáticamente.
          </p>
          {profile?.rol === 'gerencia' && (
            <button onClick={() => setEditando('new')} className="px-5 py-2 bg-blue-700 text-white rounded-xl text-sm hover:bg-blue-800 transition-colors">
              Crear flujo
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {flujos.map(flujo => (
            <div key={flujo.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 hover:border-gray-300 transition-colors">
              {/* Toggle activo */}
              <button
                onClick={() => toggleActivo(flujo)}
                className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${flujo.activo ? 'bg-green-500' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${flujo.activo ? 'left-[18px]' : 'left-0.5'}`} />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold text-gray-900 truncate">{flujo.nombre}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${flujo.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {flujo.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span>⚡</span>
                    {TRIGGER_LABELS[flujo.trigger_tipo] ?? flujo.trigger_tipo}
                  </span>
                  {flujo.descripcion && <span className="truncate max-w-xs">{flujo.descripcion}</span>}
                  <span>{flujo.nodos?.nodes?.length ?? 0} nodos</span>
                  <span>Actualizado {new Date(flujo.updated_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span>
                </div>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setEditando(flujo)}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Editar
                </button>
                {profile?.rol === 'gerencia' && (
                  <button
                    onClick={() => setConfirmDel(flujo.id)}
                    className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal eliminar */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-gray-900 mb-2">¿Eliminar flujo?</h3>
            <p className="text-sm text-gray-600 mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={() => eliminar(confirmDel)} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
