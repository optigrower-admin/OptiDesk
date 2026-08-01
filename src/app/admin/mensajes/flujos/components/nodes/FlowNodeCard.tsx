'use client'
import { Handle, Position, useReactFlow, type NodeProps } from 'reactflow'
import { CATALOGO, CATEGORIA_INFO, catalogItem } from '../../nodeCatalog'
import type { CategoriaNodo } from '@/types/flujos'

// ─── Resumen de una línea para cada tipo de nodo (mostrado en la tarjeta) ─────
function resumenNodo(tipo: string, data: Record<string, unknown>): string {
  switch (tipo) {
    case 'mensaje': {
      const c = String(data.contenido ?? '')
      return c ? `"${c.slice(0, 40)}${c.length > 40 ? '…' : ''}"` : 'Sin texto aún'
    }
    case 'media':
      return String(data.media_url ?? '') ? `${data.media_tipo ?? 'imagen'} · ${String(data.media_url).slice(0, 30)}…` : 'Sin archivo aún'
    case 'plantilla':
      return String(data.plantilla_id ?? '') ? 'Plantilla seleccionada' : 'Sin plantilla aún'
    case 'condicion': {
      const ramas = (data.ramas as { nombre?: string }[] | undefined) ?? []
      return `${ramas.length} camino${ramas.length === 1 ? '' : 's'}`
    }
    case 'dividir_trafico': {
      const vars = (data.variaciones as { nombre?: string; porcentaje?: number }[] | undefined) ?? []
      return vars.map(v => `${v.nombre ?? '?'} ${v.porcentaje ?? 0}%`).join(' / ')
    }
    case 'esperar': {
      const modo = String(data.modo ?? 'duracion')
      if (modo === 'respuesta') return 'Hasta que responda'
      if (modo === 'dias_en_etapa') return `${data.dias ?? 1} día(s) en la etapa`
      return `${data.horas ?? 24}h ${data.minutos ?? 0}m`
    }
    case 'ir_a_nodo':
      return data.nodo_destino_id ? 'Destino seleccionado' : 'Sin destino aún'
    case 'capturar_dato': {
      const campo = String(data.campo ?? 'nombre')
      const nombre = campo === 'variable' ? String(data.nombre_variable ?? 'variable') : campo
      return `Guarda en: ${nombre}${data.formato_esperado ? ` (${data.formato_esperado})` : ''}`
    }
    case 'menu_opciones':
      return `${data.cantidad ?? 3} opciones`
    case 'accion': {
      const categoria = String(data.categoria ?? '')
      if (categoria === 'bandeja_entrada') {
        const item = catalogItem('accion', 'bandeja_entrada')
        const subLabels: Record<string, string> = {
          transferir_humano: 'Transferir a humano', transferir_bot: 'Transferir a otro bot',
          archivar: 'Archivar', desarchivar: 'Desarchivar', marcar_seguimiento: 'Marcar seguimiento',
          quitar_seguimiento: 'Quitar seguimiento', bloquear_usuario: 'Bloquear usuario',
          desbloquear_usuario: 'Desbloquear usuario', anadir_nota: 'Añadir nota',
          cambiar_etapa: 'Cambiar etapa', asignar_admin: 'Asignar administrador',
        }
        return `${item?.label ?? 'Bandeja'}: ${subLabels[String(data.subtipo_bandeja ?? '')] ?? '—'}`
      }
      if (categoria === 'openai') {
        const modo = data.modo === 'agente' ? 'Agente configurado' : String(data.accion_ia ?? 'Sin acción')
        return `OpenAI: ${modo} → {${data.variable_nombre || 'variable'}}`
      }
      const item = catalogItem('accion', categoria)
      const label = item?.label ?? 'Sin categoría'

      if (categoria === 'anadir_etiqueta' || categoria === 'quitar_etiqueta') {
        const etiquetas = (data.etiquetas as { id: string; nombre: string }[] | undefined) ?? []
        const nombre = String(data.nueva_etiqueta_nombre ?? '') || etiquetas.find(e => e.id === data.etiqueta_id)?.nombre
        return nombre ? `${label}: "${nombre}"` : `${label}: sin elegir aún`
      }
      if (categoria === 'notificar_admin') {
        const titulo = String(data.notif_titulo ?? '').trim()
        return titulo ? `Notificar: "${titulo}"` : 'Notificar: sin título aún'
      }
      if (categoria === 'campo_set') {
        const v = String(data.variable_nombre ?? '')
        const val = String(data.variable_valor ?? '')
        return v ? `{${v}} = "${val.slice(0, 30)}${val.length > 30 ? '…' : ''}"` : 'Sin variable aún'
      }
      if (categoria === 'campo_clear') {
        const v = String(data.variable_nombre ?? '')
        return v ? `Limpia {${v}}` : 'Sin variable aún'
      }
      if (categoria === 'secuencia_sub' || categoria === 'secuencia_unsub') {
        const secuencias = (data.secuencias as { id: string; nombre: string }[] | undefined) ?? []
        const nombre = secuencias.find(s => s.id === data.secuencia_id)?.nombre
        return nombre ? `${label}: "${nombre}"` : `${label}: sin elegir aún`
      }
      if (categoria === 'evento_log') {
        const nombre = String(data.variable_valor ?? '').trim()
        return nombre ? `Evento: "${nombre}"` : 'Sin nombre de evento aún'
      }
      if (categoria === 'api_externa') {
        const url = String(data.api_url ?? '').trim()
        return url ? `${data.api_metodo ?? 'GET'} ${url.slice(0, 35)}${url.length > 35 ? '…' : ''}` : 'Sin URL aún'
      }
      if (categoria === 'disparador') {
        const flujos = (data.flujos_disponibles as { id: string; nombre: string }[] | undefined) ?? []
        const nombre = flujos.find(f => f.id === data.subflujo_id)?.nombre
        return nombre ? `Dispara: "${nombre}"` : 'Sin flujo elegido aún'
      }
      return label
    }
    case 'subflujo':
      return data.subflujo_id ? 'Flujo seleccionado' : 'Sin flujo aún'
    case 'fin':
      return 'Termina la ejecución'
    default:
      return ''
  }
}

function tituloNodo(tipo: string, data: Record<string, unknown>): string {
  if (tipo === 'accion') return 'Acción'
  return catalogItem(tipo)?.label ?? tipo
}

// ─── Contenedor visual plano compartido ──────────────────────────────────────
function NodeShell({
  id, categoria, icono, titulo, resumen, selected, deletable = true, width, children,
}: {
  id: string; categoria: CategoriaNodo; icono: string; titulo: string; resumen: string
  selected?: boolean; deletable?: boolean; width?: number; children?: React.ReactNode
}) {
  const { setNodes, setEdges } = useReactFlow()
  const info = CATEGORIA_INFO[categoria]
  const eliminar = () => { setNodes(ns => ns.filter(n => n.id !== id)); setEdges(es => es.filter(e => e.source !== id && e.target !== id)) }

  return (
    <div
      style={width ? { width } : undefined}
      className={`rounded-lg bg-white shadow-sm border border-slate-200 border-l-4 ${info.border} min-w-52 text-sm font-sans ${selected ? 'ring-2 ring-blue-200' : ''}`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${info.bg} ${info.text}`}>{icono}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-700 truncate">{titulo}</p>
          {resumen && <p className="text-[10px] text-slate-400 truncate">{resumen}</p>}
        </div>
        {deletable && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); eliminar() }}
            className="nodrag text-slate-300 hover:text-red-500 transition-colors text-sm leading-none w-5 h-5 flex items-center justify-center rounded flex-shrink-0"
            title="Eliminar nodo"
          >×</button>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Trigger — sin handle de entrada, no eliminable ──────────────────────────
export const TriggerNode = ({ id, data, selected }: NodeProps) => {
  const trig = String((data as Record<string, unknown>).trigger_tipo ?? 'mensaje_nuevo')
  const labels: Record<string, string> = {
    mensaje_nuevo: 'Mensaje nuevo de un contacto', lead_ad: 'Lead de anuncio', sin_respuesta_24h: 'Sin respuesta 24h',
    etapa_cambiada: 'Etapa de venta cambiada', nuevo_cliente: 'Cliente nuevo creado',
  }
  return (
    <NodeShell id={id} categoria="logica" icono="⚡" titulo="Disparador" resumen={labels[trig] ?? trig} selected={selected} deletable={false}>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-400 !w-3 !h-3" />
    </NodeShell>
  )
}

// ─── Genérico: cubre mensaje, media, plantilla, esperar, ir_a_nodo, ────────
// ─── capturar_dato, subflujo, accion (1 in / 1 out) ────────────────────────
const SIN_SOURCE = new Set(['fin', 'ir_a_nodo'])

// Clases del handle escritas literalmente por categoría (el scanner JIT de
// Tailwind necesita ver el string completo en el código fuente).
const HANDLE_CLASS: Record<CategoriaNodo, string> = {
  contenido:    '!bg-blue-400 !w-3 !h-3',
  ia:           '!bg-violet-400 !w-3 !h-3',
  logica:       '!bg-amber-400 !w-3 !h-3',
  captura:      '!bg-green-400 !w-3 !h-3',
  conversacion: '!bg-fuchsia-400 !w-3 !h-3',
  estructura:   '!bg-cyan-400 !w-3 !h-3',
}

export const GenericNode = ({ id, type, data, selected }: NodeProps) => {
  const tipo = type ?? ''
  const d = data as Record<string, unknown>
  const item = tipo === 'accion' ? catalogItem('accion', String(d.categoria ?? '')) : catalogItem(tipo)
  const categoria = item?.categoria ?? 'logica'
  const icono = item?.icono ?? '◼'
  const handleClass = HANDLE_CLASS[categoria]

  return (
    <NodeShell id={id} categoria={categoria} icono={icono} titulo={tituloNodo(tipo, d)} resumen={resumenNodo(tipo, d)} selected={selected} width={220}>
      {tipo !== 'trigger' && <Handle type="target" position={Position.Top} className={handleClass} />}
      {!SIN_SOURCE.has(tipo) && <Handle type="source" position={Position.Bottom} className={handleClass} />}
    </NodeShell>
  )
}

// ─── Condición — un handle de salida por rama + "default" ────────────────────
export const CondicionNode = ({ id, data, selected }: NodeProps) => {
  const ramas = ((data as Record<string, unknown>).ramas as { id: string; nombre?: string }[] | undefined) ?? []
  const total = ramas.length + 1
  const left = (idx: number) => `${(100 / (total + 1)) * (idx + 1)}%`

  return (
    <NodeShell id={id} categoria="logica" icono="🔀" titulo="Condición" resumen={resumenNodo('condicion', data as Record<string, unknown>)} selected={selected} width={230}>
      <Handle type="target" position={Position.Top} className="!bg-amber-400 !w-3 !h-3" />
      <div className="relative h-4 mx-2">
        {ramas.map((r, i) => (
          <span key={r.id} className="absolute text-[9px] text-amber-600 font-bold truncate" style={{ left: left(i), transform: 'translateX(-50%)', maxWidth: 50 }}>
            {r.nombre ?? `#${i + 1}`}
          </span>
        ))}
        <span className="absolute text-[9px] text-gray-400 font-bold" style={{ left: left(ramas.length), transform: 'translateX(-50%)' }}>otro</span>
      </div>
      {ramas.map((r, i) => (
        <Handle key={r.id} id={r.id} type="source" position={Position.Bottom} style={{ left: left(i) }} className="!bg-amber-400 !w-3 !h-3" />
      ))}
      <Handle id="default" type="source" position={Position.Bottom} style={{ left: left(ramas.length) }} className="!bg-gray-400 !w-3 !h-3" />
    </NodeShell>
  )
}

// ─── Dividir tráfico — un handle de salida por variación ─────────────────────
export const DividirTraficoNode = ({ id, data, selected }: NodeProps) => {
  const vars = ((data as Record<string, unknown>).variaciones as { id: string; nombre?: string; porcentaje?: number }[] | undefined) ?? []
  const left = (idx: number) => `${(100 / (vars.length + 1)) * (idx + 1)}%`

  return (
    <NodeShell id={id} categoria="logica" icono="🎲" titulo="Dividir tráfico" resumen={resumenNodo('dividir_trafico', data as Record<string, unknown>)} selected={selected} width={230}>
      <Handle type="target" position={Position.Top} className="!bg-amber-400 !w-3 !h-3" />
      <div className="relative h-4 mx-2">
        {vars.map((v, i) => (
          <span key={v.id} className="absolute text-[9px] text-amber-600 font-bold truncate" style={{ left: left(i), transform: 'translateX(-50%)', maxWidth: 50 }}>
            {v.nombre ?? `#${i + 1}`}
          </span>
        ))}
      </div>
      {vars.map((v, i) => (
        <Handle key={v.id} id={v.id} type="source" position={Position.Bottom} style={{ left: left(i) }} className="!bg-amber-400 !w-3 !h-3" />
      ))}
    </NodeShell>
  )
}

// ─── Menú de opciones — un handle numerado por opción + "otro" ──────────────
export const MenuOpcionesNode = ({ id, data, selected }: NodeProps) => {
  const cantidad = Number((data as Record<string, unknown>).cantidad ?? 3)
  const nums = Array.from({ length: cantidad }, (_, i) => i + 1)
  const left = (idx: number) => `${(100 / (cantidad + 2)) * (idx + 1)}%`

  return (
    <NodeShell id={id} categoria="captura" icono="🔢" titulo="Menú de opciones" resumen={resumenNodo('menu_opciones', data as Record<string, unknown>)} selected={selected} width={230}>
      <Handle type="target" position={Position.Top} className="!bg-green-400 !w-3 !h-3" />
      <div className="relative h-4 mx-2">
        {nums.map(n => (
          <span key={n} className="absolute text-[9px] text-green-600 font-bold" style={{ left: left(n - 1), transform: 'translateX(-50%)' }}>{n}</span>
        ))}
        <span className="absolute text-[9px] text-gray-400 font-bold" style={{ left: left(cantidad), transform: 'translateX(-50%)' }}>?</span>
      </div>
      {nums.map(n => (
        <Handle key={n} id={String(n)} type="source" position={Position.Bottom} style={{ left: left(n - 1) }} className="!bg-green-400 !w-3 !h-3" />
      ))}
      <Handle id="otro" type="source" position={Position.Bottom} style={{ left: left(cantidad) }} className="!bg-gray-400 !w-3 !h-3" />
    </NodeShell>
  )
}

export { CATALOGO }
