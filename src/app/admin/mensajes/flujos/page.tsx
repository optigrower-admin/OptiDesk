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
import { ETAPAS, type EtapaVenta } from '@/lib/ventas/pipeline'

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
type Plantilla = { id: string; nombre: string; meta_status: string; meta_template_name: string | null }
type AgenteIA = { id: string; nombre: string; proveedor: string }
type Etiqueta = { id: string; nombre: string; color: string }

// ─── Componentes base de nodos ────────────────────────────────────────────────

const nodeBaseClass = 'rounded-xl shadow-md border-2 min-w-52 text-sm font-sans bg-white'

function NodeHeader({ color, icon, label, onDelete }: { color: string; icon: string; label: string; onDelete?: () => void }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${color}`}>
      <span>{icon}</span>
      <span className="font-semibold text-white text-xs uppercase tracking-wide flex-1">{label}</span>
      {onDelete && (
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="nodrag ml-auto text-white/60 hover:text-white transition-colors text-lg leading-none w-5 h-5 flex items-center justify-center rounded"
          title="Eliminar nodo"
        >
          ×
        </button>
      )}
    </div>
  )
}

// ─── NODO: Trigger ────────────────────────────────────────────────────────────
const TriggerNode = ({ id, data }: NodeProps) => {
  const { setNodes } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))

  return (
    <div className={`${nodeBaseClass} border-blue-400`}>
      <NodeHeader color="bg-blue-500" icon="⚡" label="Disparador" />
      <div className="px-3 py-2.5 space-y-2">
        <label className="block text-xs text-gray-500 font-medium">Cuándo activar</label>
        <select defaultValue={data.trigger_tipo ?? 'mensaje_nuevo'} onChange={e => upd('trigger_tipo', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="mensaje_nuevo">Mensaje nuevo de un contacto</option>
          <option value="lead_ad">Lead de anuncio (Facebook Ads)</option>
          <option value="sin_respuesta_24h">Sin respuesta del asesor &gt;24h</option>
          <option value="etapa_cambiada">Etapa de venta cambiada</option>
          <option value="nuevo_cliente">Cliente nuevo creado</option>
        </select>
        {(data.trigger_tipo === 'etapa_cambiada') && (
          <select defaultValue={data.etapa_trigger ?? ''} onChange={e => upd('etapa_trigger', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400">
            <option value="">Cualquier etapa</option>
            {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Mensaje ────────────────────────────────────────────────────────────
const MensajeNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string | boolean) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }
  const plantillas: Plantilla[] = data.plantillas ?? []

  return (
    <div className={`${nodeBaseClass} border-green-400`}>
      <Handle type="target" position={Position.Top} className="!bg-green-400 !w-3 !h-3" />
      <NodeHeader color="bg-green-500" icon="💬" label="Enviar mensaje" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" defaultChecked={data.usar_plantilla ?? false}
            onChange={e => upd('usar_plantilla', e.target.checked)} className="rounded" />
          Usar plantilla Meta aprobada
        </label>
        {data.usar_plantilla ? (
          <select defaultValue={data.plantilla_id ?? ''} onChange={e => upd('plantilla_id', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400">
            <option value="">Seleccionar plantilla...</option>
            {plantillas.filter(p => p.meta_status === 'aprobada').map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        ) : (
          <textarea defaultValue={data.contenido ?? ''} onChange={e => upd('contenido', e.target.value)}
            placeholder="Mensaje... usa {{nombre}} {{celular}} {{etapa}}"
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400 resize-none font-mono" />
        )}
        <p className="text-[10px] text-gray-400">Variables: {'{{nombre}} {{celular}} {{etapa}} {{canal}} {{ultimo_mensaje}}'}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-green-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Asignar ────────────────────────────────────────────────────────────
const AsignarNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }
  const equipo: Usuario[] = data.equipo ?? []

  return (
    <div className={`${nodeBaseClass} border-purple-400`}>
      <Handle type="target" position={Position.Top} className="!bg-purple-400 !w-3 !h-3" />
      <NodeHeader color="bg-purple-500" icon="👤" label="Asignar asesor" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <select defaultValue={data.tipo_asignacion ?? 'round_robin'} onChange={e => upd('tipo_asignacion', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400">
          <option value="round_robin">Round Robin (automático)</option>
          <option value="usuario_fijo">Usuario fijo</option>
        </select>
        {data.tipo_asignacion === 'usuario_fijo' && (
          <select defaultValue={data.asignar_a ?? ''} onChange={e => upd('asignar_a', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400">
            <option value="">Seleccionar asesor...</option>
            {equipo.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Esperar ────────────────────────────────────────────────────────────
const EsperarNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }

  return (
    <div className={`${nodeBaseClass} border-orange-400`}>
      <Handle type="target" position={Position.Top} className="!bg-orange-400 !w-3 !h-3" />
      <NodeHeader color="bg-orange-500" icon="⏱️" label="Esperar / Delay" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <input type="number" defaultValue={data.horas ?? 24} min={0} max={720}
            onChange={e => upd('horas', e.target.value)}
            className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <span className="text-xs text-gray-500">horas</span>
          <input type="number" defaultValue={data.minutos ?? 0} min={0} max={59}
            onChange={e => upd('minutos', e.target.value)}
            className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400" />
          <span className="text-xs text-gray-500">min</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-orange-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Etapa ─────────────────────────────────────────────────────────────
const EtapaNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }

  return (
    <div className={`${nodeBaseClass} border-cyan-400`}>
      <Handle type="target" position={Position.Top} className="!bg-cyan-400 !w-3 !h-3" />
      <NodeHeader color="bg-cyan-500" icon="📊" label="Cambiar etapa" onDelete={eliminar} />
      <div className="px-3 py-2.5">
        <select defaultValue={data.etapa ?? 'nuevo'} onChange={e => upd('etapa', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400">
          {ETAPAS.map(e => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Condición ─────────────────────────────────────────────────────────
const CondicionNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }

  const tipo   = (data.condicion_tipo ?? 'respuesta_contiene') as string
  const agentes: AgenteIA[] = data.agentes ?? []

  // grupos de tipos que necesitan campo de texto/valor
  const needsTexto    = ['respuesta_contiene','palabras_clave','contiene_todas','es_exactamente','empieza_con','termina_con']
  const needsLongitud = tipo === 'longitud_mayor'
  const needsCanal    = tipo === 'canal'
  const needsEtapa    = tipo === 'etapa'
  const needsIA       = tipo === 'ia_evalua'

  const placeholderTexto: Record<string,string> = {
    respuesta_contiene: 'ej: precio, cuánto, moto...',
    palabras_clave:     'palabras separadas por coma: precio,cuánto,valor',
    contiene_todas:     'todas deben estar: hola,precio',
    es_exactamente:     'texto exacto que debe escribir',
    empieza_con:        'ej: Hola, Buenas, Buenos...',
    termina_con:        'ej: gracias, porfa, porfavor',
  }

  return (
    <div className={`${nodeBaseClass} border-yellow-400`} style={{ width: 230 }}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-400 !w-3 !h-3" />
      <NodeHeader color="bg-yellow-500" icon="🔀" label="Condición" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">

        {/* Selector principal de tipo */}
        <select value={tipo} onChange={e => upd('condicion_tipo', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400">
          <optgroup label="── Texto del mensaje ──">
            <option value="respuesta_contiene">Contiene alguna palabra</option>
            <option value="palabras_clave">Contiene ALGUNA palabra clave</option>
            <option value="contiene_todas">Contiene TODAS las palabras</option>
            <option value="es_exactamente">Es exactamente este texto</option>
            <option value="empieza_con">Empieza con...</option>
            <option value="termina_con">Termina con...</option>
            <option value="longitud_mayor">Longitud mayor a N caracteres</option>
          </optgroup>
          <optgroup label="── Intención detectada ──">
            <option value="es_positivo">Respuesta positiva (sí/ok/claro...)</option>
            <option value="es_negativo">Respuesta negativa (no/tampoco...)</option>
            <option value="es_numero">Respuesta es un número</option>
          </optgroup>
          <optgroup label="── Contexto del cliente ──">
            <option value="canal">Canal específico</option>
            <option value="etapa">Etapa actual es</option>
            <option value="tiene_celular">Tiene celular registrado</option>
            <option value="es_nuevo">Es cliente nuevo</option>
            <option value="horario_laboral">Está en horario laboral</option>
          </optgroup>
          <optgroup label="── Inteligencia Artificial ──">
            <option value="ia_evalua">IA evalúa si se cumple condición</option>
          </optgroup>
        </select>

        {/* Campo texto para condiciones de texto */}
        {needsTexto.includes(tipo) && (
          <input type="text" defaultValue={data.condicion_valor ?? ''} onChange={e => upd('condicion_valor', e.target.value)}
            placeholder={placeholderTexto[tipo] ?? 'Valor...'}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400" />
        )}

        {/* Campo longitud */}
        {needsLongitud && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 whitespace-nowrap">Mayor a</span>
            <input type="number" min={1} defaultValue={data.condicion_valor ?? '10'} onChange={e => upd('condicion_valor', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400" />
            <span className="text-xs text-gray-500 whitespace-nowrap">chars</span>
          </div>
        )}

        {/* Campo canal */}
        {needsCanal && (
          <select defaultValue={data.condicion_valor ?? ''} onChange={e => upd('condicion_valor', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400">
            <option value="">Cualquier canal</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="messenger">Messenger</option>
            <option value="instagram">Instagram</option>
          </select>
        )}

        {/* Campo etapa */}
        {needsEtapa && (
          <select defaultValue={data.condicion_valor ?? ''} onChange={e => upd('condicion_valor', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400">
            <option value="">Seleccionar etapa...</option>
            {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        )}

        {/* Campos IA: agente + pregunta */}
        {needsIA && (
          <div className="space-y-1.5">
            <select defaultValue={data.agente_id ?? ''} onChange={e => upd('agente_id', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400">
              <option value="">Agente IA a usar...</option>
              {agentes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <textarea
              defaultValue={data.condicion_pregunta ?? ''}
              onChange={e => upd('condicion_pregunta', e.target.value)}
              rows={3}
              placeholder={'¿El cliente está interesado en comprar una moto?\n¿Mencionó algún precio o modelo?\n(La IA responde SÍ/NO)'}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400 resize-none"
            />
            <p className="text-[10px] text-gray-400 leading-tight">La IA lee el mensaje del cliente y responde SÍ o NO según tu pregunta.</p>
          </div>
        )}

        {/* Etiquetas informativas para tipos sin campo extra */}
        {['es_positivo','es_negativo','es_numero','tiene_celular','es_nuevo','horario_laboral'].includes(tipo) && (
          <p className="text-[10px] text-gray-400 leading-tight italic">
            {tipo === 'es_positivo' && 'Detecta: sí, si, claro, dale, ok, bueno, exacto, correcto, afirmativo…'}
            {tipo === 'es_negativo' && 'Detecta: no, nop, nope, tampoco, negativo, para nada…'}
            {tipo === 'es_numero'   && 'El cliente respondió solo un número (ej: "1", "2", "50000")'}
            {tipo === 'tiene_celular' && 'Verifica si el cliente tiene celular registrado en el CRM'}
            {tipo === 'es_nuevo'    && 'Cliente en etapa nuevo_mensaje o nuevo'}
            {tipo === 'horario_laboral' && 'Lunes a sábado 7am–6pm (hora Colombia)'}
          </p>
        )}
      </div>

      <div className="flex justify-between px-3 pb-2 text-[10px] font-bold">
        <span className="text-green-600">✅ SÍ (izq)</span>
        <span className="text-red-500">❌ NO (der)</span>
      </div>
      <Handle id="true"  type="source" position={Position.Bottom} style={{ left: '25%' }}  className="!bg-green-400 !w-3 !h-3" />
      <Handle id="false" type="source" position={Position.Bottom} style={{ left: '75%' }}  className="!bg-red-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Agente IA ──────────────────────────────────────────────────────────
const AgenteIANode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string | boolean) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }
  const agentes: AgenteIA[] = data.agentes ?? []

  return (
    <div className={`${nodeBaseClass} border-indigo-400`}>
      <Handle type="target" position={Position.Top} className="!bg-indigo-400 !w-3 !h-3" />
      <NodeHeader color="bg-indigo-600" icon="🤖" label="Agente IA" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <label className="block text-xs text-gray-500 font-medium">Agente configurado</label>
        <select defaultValue={data.agente_id ?? ''} onChange={e => upd('agente_id', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400">
          <option value="">Seleccionar agente...</option>
          {agentes.map(a => (
            <option key={a.id} value={a.id}>{a.nombre} ({a.proveedor})</option>
          ))}
        </select>
        <textarea defaultValue={data.prompt_contexto ?? ''} onChange={e => upd('prompt_contexto', e.target.value)}
          placeholder="Contexto adicional para este nodo (opcional)..."
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none" />
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" defaultChecked={data.incluir_historial ?? true}
            onChange={e => upd('incluir_historial', e.target.checked)} className="rounded" />
          Incluir historial de la conversación
        </label>
        {!agentes.length && (
          <p className="text-[10px] text-amber-600">⚠ Configura agentes IA en Config Ventas → APIs IA</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Plantilla Meta ─────────────────────────────────────────────────────
const PlantillaNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }
  const plantillas: Plantilla[] = data.plantillas ?? []

  return (
    <div className={`${nodeBaseClass} border-teal-400`}>
      <Handle type="target" position={Position.Top} className="!bg-teal-400 !w-3 !h-3" />
      <NodeHeader color="bg-teal-600" icon="📋" label="Plantilla aprobada" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <select defaultValue={data.plantilla_id ?? ''} onChange={e => upd('plantilla_id', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400">
          <option value="">Seleccionar plantilla aprobada...</option>
          {plantillas.filter(p => p.meta_status === 'aprobada').map(p => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <p className="text-[10px] text-gray-400">Solo para WhatsApp fuera de la ventana de 24h</p>
        {!plantillas.filter(p => p.meta_status === 'aprobada').length && (
          <p className="text-[10px] text-amber-600">⚠ Sin plantillas aprobadas. Crea una en Mensajes → Plantillas</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-teal-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Media ─────────────────────────────────────────────────────────────
const MediaNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }

  return (
    <div className={`${nodeBaseClass} border-pink-400`}>
      <Handle type="target" position={Position.Top} className="!bg-pink-400 !w-3 !h-3" />
      <NodeHeader color="bg-pink-500" icon="📎" label="Enviar archivo" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <select defaultValue={data.media_tipo ?? 'imagen'} onChange={e => upd('media_tipo', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-pink-400">
          <option value="imagen">🖼 Imagen</option>
          <option value="documento">📄 Documento / PDF</option>
          <option value="audio">🎵 Audio</option>
          <option value="video">🎬 Video</option>
        </select>
        <input type="url" defaultValue={data.media_url ?? ''} onChange={e => upd('media_url', e.target.value)}
          placeholder="URL pública del archivo..."
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-pink-400" />
        <input type="text" defaultValue={data.media_caption ?? ''} onChange={e => upd('media_caption', e.target.value)}
          placeholder="Pie de foto (opcional)"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-pink-400" />
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-pink-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Nota interna ───────────────────────────────────────────────────────
const NotaInternaNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }

  return (
    <div className={`${nodeBaseClass} border-yellow-300`}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-400 !w-3 !h-3" />
      <NodeHeader color="bg-yellow-400" icon="📝" label="Nota interna" onDelete={eliminar} />
      <div className="px-3 py-2.5">
        <textarea defaultValue={data.contenido ?? ''} onChange={e => upd('contenido', e.target.value)}
          placeholder="Nota visible solo para el equipo..."
          rows={2}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400 resize-none" />
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-yellow-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Subflujo ───────────────────────────────────────────────────────────
const SubflujoNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }
  const flujos: { id: string; nombre: string }[] = data.flujos_disponibles ?? []

  return (
    <div className={`${nodeBaseClass} border-slate-400`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3" />
      <NodeHeader color="bg-slate-600" icon="🔗" label="Subflujo" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <label className="block text-xs text-gray-500">Flujo anidado a ejecutar</label>
        <select defaultValue={data.subflujo_id ?? ''} onChange={e => upd('subflujo_id', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400">
          <option value="">Seleccionar flujo...</option>
          {flujos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Fin ───────────────────────────────────────────────────────────────
// ─── NODO: Etiqueta ──────────────────────────────────────────────────────────
const EtiquetaNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }
  const etiquetas: Etiqueta[] = data.etiquetas ?? []
  const etiquetaId = String(data.etiqueta_id ?? '')
  const seleccionada = etiquetas.find(e => e.id === etiquetaId)
  return (
    <div className={`${nodeBaseClass} border-rose-300`} style={{ width: 230 }}>
      <Handle type="target" position={Position.Top} className="!bg-rose-400 !w-3 !h-3" />
      <NodeHeader color="bg-rose-500" icon="🏷️" label="Etiquetar cliente" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <select defaultValue={data.accion ?? 'agregar'} onChange={e => upd('accion', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400">
          <option value="agregar">➕ Agregar etiqueta</option>
          <option value="quitar">➖ Quitar etiqueta</option>
        </select>
        <div className="flex items-center gap-2">
          {seleccionada && (
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seleccionada.color }} />
          )}
          <select value={etiquetaId} onChange={e => upd('etiqueta_id', e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400">
            <option value="">— Seleccionar etiqueta —</option>
            {etiquetas.map(et => (
              <option key={et.id} value={et.id}>{et.nombre}</option>
            ))}
          </select>
        </div>
        {etiquetas.length === 0 && (
          <p className="text-[10px] text-gray-400">Crea etiquetas en Config Ventas → Etiquetas</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-rose-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Menú de opciones ───────────────────────────────────────────────────
const MenuOpcionesNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }

  const cantidad = Number(data.cantidad ?? 3)
  const etiquetas: string[] = data.etiquetas ?? []

  const updCantidad = (n: number) =>
    setNodes(ns => ns.map(node => node.id === id ? { ...node, data: { ...node.data, cantidad: n } } : node))

  const updEtiqueta = (i: number, v: string) => {
    const nuevas = [...etiquetas]
    nuevas[i] = v
    setNodes(ns => ns.map(node => node.id === id ? { ...node, data: { ...node.data, etiquetas: nuevas } } : node))
  }

  // Posiciones de handles: opciones 1..N + "otro" al final
  // Total handles = cantidad + 1 (otro); distribuidos en el ancho del nodo
  const getLeft = (idx: number) => `${(100 / (cantidad + 2)) * (idx + 1)}%`

  const nums = Array.from({ length: cantidad }, (_, i) => i + 1)

  return (
    <div className={`${nodeBaseClass} border-fuchsia-400`} style={{ width: 250 }}>
      <Handle type="target" position={Position.Top} className="!bg-fuchsia-400 !w-3 !h-3" />
      <NodeHeader color="bg-fuchsia-500" icon="📋" label="Menú de opciones" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 whitespace-nowrap">Número de opciones:</label>
          <select
            value={cantidad}
            onChange={e => updCantidad(Number(e.target.value))}
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
          >
            {[2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} opciones</option>)}
          </select>
        </div>

        <div className="space-y-1">
          {nums.map(n => (
            <div key={n} className="flex items-center gap-1.5">
              <span className="text-fuchsia-600 font-bold text-xs w-4 text-right flex-shrink-0">{n}.</span>
              <input
                key={`${id}-op-${n}`}
                type="text"
                defaultValue={etiquetas[n - 1] ?? ''}
                onChange={e => updEtiqueta(n - 1, e.target.value)}
                placeholder={`Opción ${n} (etiqueta opcional)`}
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400"
              />
            </div>
          ))}
        </div>

        <p className="text-[10px] text-gray-400 leading-tight">
          El cliente responde con el número (1, 2, 3…). Si la respuesta no coincide → salida <span className="text-amber-600 font-medium">?otro</span>.
        </p>
      </div>

      {/* Etiquetas de handles */}
      <div className="relative h-5 mx-3">
        {nums.map(n => (
          <span
            key={n}
            className="absolute text-[9px] text-fuchsia-600 font-bold"
            style={{ left: getLeft(n - 1), transform: 'translateX(-50%)' }}
          >{n}</span>
        ))}
        <span
          className="absolute text-[9px] text-amber-500 font-bold"
          style={{ left: getLeft(cantidad), transform: 'translateX(-50%)' }}
        >?</span>
      </div>

      {/* Handles numerados */}
      {nums.map(n => (
        <Handle
          key={n}
          id={String(n)}
          type="source"
          position={Position.Bottom}
          style={{ left: getLeft(n - 1) }}
          className="!bg-fuchsia-400 !w-3 !h-3"
        />
      ))}
      {/* Handle fallback */}
      <Handle
        id="otro"
        type="source"
        position={Position.Bottom}
        style={{ left: getLeft(cantidad) }}
        className="!bg-amber-400 !w-3 !h-3"
      />
    </div>
  )
}

// ─── NODO: Capturar dato ─────────────────────────────────────────────────────
const CapturarDatoNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }

  const campo = String(data.campo ?? 'nombre')
  const esVariable = campo === 'variable'

  const etiquetaCampo: Record<string, string> = {
    nombre: 'nombre del cliente',
    celular: 'celular',
    email: 'correo electrónico',
    cedula: 'número de cédula',
  }

  return (
    <div className={`${nodeBaseClass} border-violet-400`} style={{ width: 230 }}>
      <Handle type="target" position={Position.Top} className="!bg-violet-400 !w-3 !h-3" />
      <NodeHeader color="bg-violet-500" icon="💾" label="Guardar respuesta" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <label className="block text-xs text-gray-500 font-medium">Guardar último mensaje del cliente en:</label>
        <select value={campo} onChange={e => upd('campo', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400">
          <optgroup label="── Perfil del cliente ──">
            <option value="nombre">Nombre del cliente</option>
            <option value="celular">Celular</option>
            <option value="email">Correo electrónico</option>
            <option value="cedula">Número de cédula</option>
          </optgroup>
          <optgroup label="── Variable del flujo ──">
            <option value="variable">Variable personalizada</option>
          </optgroup>
        </select>
        {esVariable ? (
          <>
            <input type="text" defaultValue={data.nombre_variable ?? ''} onChange={e => upd('nombre_variable', e.target.value)}
              placeholder="Nombre de la variable (ej: moto_interes)"
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400" />
            <p className="text-[10px] text-violet-600 leading-tight">
              Usa {'{{variables.'}{data.nombre_variable || 'nombre_variable'}{'}}' } en mensajes siguientes.
            </p>
          </>
        ) : (
          <p className="text-[10px] text-violet-600 leading-tight font-medium">
            Actualiza el campo <strong>{etiquetaCampo[campo]}</strong> del cliente en el CRM.
            También disponible como {'{{variables.'}{campo}{'}}' }.
          </p>
        )}
        <p className="text-[10px] text-gray-400 leading-tight">
          Pon un nodo Condición antes para validar el dato antes de guardarlo.
        </p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-violet-400 !w-3 !h-3" />
    </div>
  )
}

// ─── NODO: Ir a nodo (goto / loop-back) ──────────────────────────────────────
const IrANodoNode = ({ id, data }: NodeProps) => {
  const { setNodes, setEdges, getNodes } = useReactFlow()
  const upd = (k: string, v: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, [k]: v } } : n))
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }

  const otrosNodos = getNodes().filter(n => n.id !== id)

  const iconTipo: Record<string, string> = {
    trigger: '⚡', mensaje: '💬', esperar: '⏱️', condicion: '🔀',
    menu_opciones: '📋', capturar_dato: '💾', asignar: '👤', etapa: '📊',
    etiqueta: '🏷️', agente_ia: '🤖', plantilla: '📄', media: '📎',
    nota_interna: '📝', subflujo: '🔗', fin: '🏁',
  }

  const labelNodo = (n: typeof otrosNodos[number]) => {
    const icono = iconTipo[n.type ?? ''] ?? '◼'
    const d = n.data as Record<string, unknown>
    if (n.type === 'mensaje' && d.contenido)
      return `${icono} Mensaje: "${String(d.contenido).slice(0, 22)}…"`
    if (n.type === 'esperar')
      return `${icono} Esperar ${d.horas ?? 24}h ${d.minutos ? `${d.minutos}m` : ''}`
    if (n.type === 'menu_opciones')
      return `${icono} Menú (${d.cantidad ?? 3} opciones)`
    if (n.type === 'condicion')
      return `${icono} Condición: ${d.condicion_tipo ?? ''}`
    const tipoNombre: Record<string, string> = {
      trigger: 'Disparador', asignar: 'Asignar asesor', etapa: 'Cambiar etapa',
      etiqueta: 'Etiquetar', capturar_dato: 'Guardar dato', agente_ia: 'Agente IA',
      plantilla: 'Plantilla', media: 'Archivo', nota_interna: 'Nota interna',
      subflujo: 'Subflujo', fin: 'Fin del flujo',
    }
    return `${icono} ${tipoNombre[n.type ?? ''] ?? n.type ?? 'Nodo'}`
  }

  return (
    <div className={`${nodeBaseClass} border-sky-400`} style={{ width: 230 }}>
      <Handle type="target" position={Position.Top} className="!bg-sky-400 !w-3 !h-3" />
      <NodeHeader color="bg-sky-500" icon="↩" label="Ir a nodo" onDelete={eliminar} />
      <div className="px-3 py-2.5 space-y-2">
        <label className="block text-xs text-gray-500 font-medium">Saltar a:</label>
        <select
          value={data.nodo_destino_id ?? ''}
          onChange={e => upd('nodo_destino_id', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-400"
        >
          <option value="">— Seleccionar nodo —</option>
          {otrosNodos.map(n => (
            <option key={n.id} value={n.id}>{labelNodo(n)}</option>
          ))}
        </select>
        <p className="text-[10px] text-gray-400 leading-tight">
          El flujo salta directamente a ese nodo. Para esperar la siguiente respuesta del cliente, apunta a un nodo <strong>Esperar</strong>.
        </p>
      </div>
      {/* Sin handle de salida — el destino se define en el selector */}
    </div>
  )
}

const FinNode = ({ id }: NodeProps) => {
  const { setNodes, setEdges } = useReactFlow()
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }
  return (
    <div className={`${nodeBaseClass} border-gray-300`}>
      <Handle type="target" position={Position.Top} className="!bg-gray-400 !w-3 !h-3" />
      <NodeHeader color="bg-gray-500" icon="🏁" label="Fin del flujo" onDelete={eliminar} />
    </div>
  )
}

// ─── Registro de tipos de nodo ────────────────────────────────────────────────
const NODE_TYPES: NodeTypes = {
  trigger:       TriggerNode,
  mensaje:       MensajeNode,
  asignar:       AsignarNode,
  esperar:       EsperarNode,
  etapa:         EtapaNode,
  condicion:     CondicionNode,
  agente_ia:     AgenteIANode,
  plantilla:     PlantillaNode,
  media:         MediaNode,
  nota_interna:  NotaInternaNode,
  etiqueta:      EtiquetaNode,
  subflujo:      SubflujoNode,
  capturar_dato:  CapturarDatoNode,
  menu_opciones:  MenuOpcionesNode,
  ir_a_nodo:      IrANodoNode,
  fin:            FinNode,
}

// ─── Paleta de nodos ──────────────────────────────────────────────────────────
const PALETTE_ITEMS = [
  { type: 'mensaje',       icon: '💬', label: 'Enviar mensaje',    color: 'border-green-300 bg-green-50 hover:bg-green-100'    },
  { type: 'agente_ia',    icon: '🤖', label: 'Agente IA',         color: 'border-indigo-300 bg-indigo-50 hover:bg-indigo-100'  },
  { type: 'plantilla',    icon: '📋', label: 'Plantilla Meta',    color: 'border-teal-300 bg-teal-50 hover:bg-teal-100'       },
  { type: 'media',        icon: '📎', label: 'Archivo/Media',     color: 'border-pink-300 bg-pink-50 hover:bg-pink-100'       },
  { type: 'condicion',    icon: '🔀', label: 'Condición',         color: 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100'  },
  { type: 'capturar_dato', icon: '💾', label: 'Guardar respuesta', color: 'border-violet-300 bg-violet-50 hover:bg-violet-100' },
  { type: 'menu_opciones', icon: '📋', label: 'Menú de opciones', color: 'border-fuchsia-300 bg-fuchsia-50 hover:bg-fuchsia-100' },
  { type: 'ir_a_nodo',    icon: '↩',  label: 'Ir a nodo',       color: 'border-sky-300 bg-sky-50 hover:bg-sky-100'             },
  { type: 'asignar',      icon: '👤', label: 'Asignar asesor',    color: 'border-purple-300 bg-purple-50 hover:bg-purple-100'  },
  { type: 'etapa',        icon: '📊', label: 'Cambiar etapa',     color: 'border-cyan-300 bg-cyan-50 hover:bg-cyan-100'       },
  { type: 'esperar',      icon: '⏱️', label: 'Esperar / Delay',   color: 'border-orange-300 bg-orange-50 hover:bg-orange-100'  },
  { type: 'etiqueta',     icon: '🏷️', label: 'Etiquetar cliente', color: 'border-rose-300 bg-rose-50 hover:bg-rose-100'       },
  { type: 'nota_interna', icon: '📝', label: 'Nota interna',      color: 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100'  },
  { type: 'subflujo',     icon: '🔗', label: 'Subflujo',          color: 'border-slate-300 bg-slate-50 hover:bg-slate-100'    },
  { type: 'fin',          icon: '🏁', label: 'Fin del flujo',     color: 'border-gray-300 bg-gray-50 hover:bg-gray-100'       },
]

function getDefaultData(type: string, ctx: { equipo: Usuario[]; plantillas: Plantilla[]; agentes: AgenteIA[]; flujos: { id: string; nombre: string }[]; etiquetas: Etiqueta[] }): Record<string, unknown> {
  switch (type) {
    case 'trigger':       return { trigger_tipo: 'mensaje_nuevo' }
    case 'mensaje':       return { contenido: '', usar_plantilla: false, plantillas: ctx.plantillas }
    case 'asignar':       return { tipo_asignacion: 'round_robin', asignar_a: '', equipo: ctx.equipo }
    case 'esperar':       return { horas: 24, minutos: 0 }
    case 'etapa':         return { etapa: 'nuevo' }
    case 'condicion':     return { condicion_tipo: 'respuesta_contiene', condicion_valor: '' }
    case 'agente_ia':     return { agente_id: '', prompt_contexto: '', incluir_historial: true, agentes: ctx.agentes }
    case 'plantilla':     return { plantilla_id: '', plantillas: ctx.plantillas }
    case 'media':         return { media_tipo: 'imagen', media_url: '', media_caption: '' }
    case 'nota_interna':  return { contenido: '' }
    case 'etiqueta':      return { accion: 'agregar', etiqueta_id: '', etiquetas: ctx.etiquetas }
    case 'subflujo':      return { subflujo_id: '', flujos_disponibles: ctx.flujos }
    case 'capturar_dato':  return { campo: 'nombre', nombre_variable: '' }
    case 'menu_opciones':  return { cantidad: 3, etiquetas: ['', '', ''] }
    case 'ir_a_nodo':      return { nodo_destino_id: '' }
    case 'fin':            return {}
    default:              return {}
  }
}

// ─── Editor de flujo (canvas principal) ──────────────────────────────────────

type EditorCtx = { equipo: Usuario[]; plantillas: Plantilla[]; agentes: AgenteIA[]; flujos: { id: string; nombre: string }[]; etiquetas: Etiqueta[] }

type EditorProps = {
  flujo: Flujo | null
  ctx: EditorCtx
  onClose: () => void
  onSaved: () => void
  tenantId: string
}

function FlowEditorCanvas({ flujo, ctx, onClose, onSaved, tenantId }: EditorProps) {
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
  const [nodes, setNodes, onNodesChange] = useNodesState(parsed?.nodes ?? [defaultTrigger])
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed?.edges ?? [])
  const [nombre,      setNombre]      = useState(flujo?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(flujo?.descripcion ?? '')
  const [activo,      setActivo]      = useState(flujo?.activo ?? false)
  const [saving,      setSaving]      = useState(false)
  const [showEjec,    setShowEjec]    = useState(false)
  const [ejecs,       setEjecs]       = useState<unknown[]>([])

  // Inyectar datos del contexto en los nodos cuando cambia ctx
  useEffect(() => {
    if (!ctx.equipo.length && !ctx.plantillas.length && !ctx.agentes.length) return
    setNodes(ns => ns.map(n => {
      if (n.type === 'asignar')   return { ...n, data: { ...n.data, equipo: ctx.equipo } }
      if (n.type === 'mensaje')   return { ...n, data: { ...n.data, plantillas: ctx.plantillas } }
      if (n.type === 'plantilla') return { ...n, data: { ...n.data, plantillas: ctx.plantillas } }
      if (n.type === 'agente_ia') return { ...n, data: { ...n.data, agentes: ctx.agentes } }
      if (n.type === 'subflujo')  return { ...n, data: { ...n.data, flujos_disponibles: ctx.flujos } }
      return n
    }))
  }, [ctx])

  const onConnect = useCallback(
    (c: Connection) => setEdges(es => addEdge({ ...c, type: 'smoothstep', animated: true, style: { stroke: '#6366f1' } }, es)),
    [setEdges]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow')
    if (!type || !rfInstance || !rfWrapper.current) return
    const bounds   = rfWrapper.current.getBoundingClientRect()
    const position = rfInstance.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
    setNodes(ns => [...ns, { id: `node-${Date.now()}`, type, position, data: getDefaultData(type, ctx) }])
  }, [rfInstance, setNodes, ctx])

  const addNode = (type: string) => {
    const y = nodes.length > 0 ? Math.max(...nodes.map(n => n.position.y)) + 160 : 220
    setNodes(ns => [...ns, { id: `node-${Date.now()}`, type, position: { x: 200, y }, data: getDefaultData(type, ctx) }])
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
          trigger_tipo: triggerTipo, nodos, activo,
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
        <button onClick={guardar} disabled={saving}
          className="px-4 py-1.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800 disabled:opacity-50 transition-colors">
          {saving ? 'Guardando...' : 'Guardar flujo'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Paleta de nodos */}
        <div className="w-48 bg-white border-r border-gray-200 p-3 flex-shrink-0 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">Nodos disponibles</p>
          <div className="space-y-1">
            {PALETTE_ITEMS.map(item => (
              <div key={item.type} draggable
                onDragStart={e => { e.dataTransfer.setData('application/reactflow', item.type); e.dataTransfer.effectAllowed = 'move' }}
                onClick={() => addNode(item.type)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${item.color}`}>
                <span className="text-sm">{item.icon}</span>
                <span className="text-xs font-medium text-gray-700">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 leading-relaxed px-1">
              Arrastra o haz clic para agregar.<br />
              Conecta arrastrando entre los puntos azules.<br />
              <kbd className="bg-gray-100 px-1 rounded text-[9px]">Del</kbd> para eliminar seleccionados.
            </p>
          </div>
        </div>

        {/* Canvas React Flow */}
        <div ref={rfWrapper} className="flex-1 bg-gray-50">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onInit={setRfInstance}
            onDrop={onDrop} onDragOver={onDragOver}
            nodeTypes={NODE_TYPES} fitView
            deleteKeyCode="Delete" snapToGrid snapGrid={[16, 16]}
            defaultEdgeOptions={{ type: 'smoothstep', animated: true, style: { stroke: '#6366f1' } }}>
            <Background color="#e5e7eb" gap={16} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} pannable zoomable className="!bg-white !border-gray-200" />
          </ReactFlow>
        </div>
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
  const [ctx,      setCtx]      = useState<EditorCtx>({ equipo: [], plantillas: [], agentes: [], flujos: [], etiquetas: [] })
  const [loading,  setLoading]  = useState(true)
  const [editando, setEditando] = useState<Flujo | null | 'new'>(null)
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
    Promise.all([
      supabase.from('usuarios').select('id, nombre').eq('tenant_id', profile.tenant_id),
      supabase.from('plantillas_mensajes').select('id, nombre, meta_status, meta_template_name').eq('tenant_id', profile.tenant_id),
      supabase.from('agentes_ia').select('id, nombre, proveedor').eq('tenant_id', profile.tenant_id).eq('activo', true),
      supabase.from('flujos_automatizacion').select('id, nombre').eq('tenant_id', profile.tenant_id),
      supabase.from('etiquetas_venta').select('id, nombre, color').eq('tenant_id', profile.tenant_id).order('nombre'),
    ]).then(([{ data: eq }, { data: pl }, { data: ag }, { data: fl }, { data: et }]) => {
      setCtx({
        equipo:     (eq as Usuario[]) ?? [],
        plantillas: (pl as Plantilla[]) ?? [],
        agentes:    (ag as AgenteIA[]) ?? [],
        flujos:     ((fl as { id: string; nombre: string }[]) ?? []),
        etiquetas:  ((et as Etiqueta[]) ?? []),
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
      />
    )
  }

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

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-xs text-blue-800">
        <p className="font-semibold mb-1">⚡ Cómo funcionan los flujos</p>
        <p>Cuando llega un mensaje de WhatsApp, Messenger o Instagram, el sistema detecta si hay un flujo activo con ese disparador y lo ejecuta automáticamente. Los <strong>delays</strong> se procesan cada minuto. Los <strong>Agentes IA</strong> requieren configurar las API keys en <em>Config Ventas → APIs IA</em>.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : flujos.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <span className="text-4xl block mb-3">⚡</span>
          <h3 className="font-semibold text-gray-900 mb-1">Sin flujos aún</h3>
          <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">Crea tu primer flujo para automatizar respuestas y gestión de clientes.</p>
          {profile?.rol === 'gerencia' && (
            <button onClick={() => setEditando('new')} className="px-5 py-2 bg-blue-700 text-white rounded-xl text-sm hover:bg-blue-800">
              Crear primer flujo
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {flujos.map(flujo => {
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
