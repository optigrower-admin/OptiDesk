'use client'
import { useState } from 'react'
import type { Node } from 'reactflow'
import { ETAPAS } from '@/lib/ventas/pipeline'
import { CATEGORIA_INFO, catalogItem, type CatalogCtx } from '../nodeCatalog'
import type { CondicionTipoSimple, VariableDefinida, TipoVariable, CategoriaAccion, SubtipoBandeja } from '@/types/flujos'

type Props = {
  node: Node
  ctx: CatalogCtx
  allNodes: Node[]
  variables: VariableDefinida[]
  onCrearVariable: (v: VariableDefinida) => void
  onChange: (patch: Record<string, unknown>) => void
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400'
const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

const TIPOS_VARIABLE: { value: TipoVariable; label: string }[] = [
  { value: 'texto', label: 'Texto' }, { value: 'numero', label: 'Número' },
  { value: 'fecha', label: 'Fecha' }, { value: 'booleano', label: 'Sí/No' },
  { value: 'imagen', label: 'Imagen (URL)' }, { value: 'audio', label: 'Audio (URL/base64)' },
]

const CONDICIONES_OPCIONES: { value: CondicionTipoSimple; label: string; grupo: string }[] = [
  { value: 'respuesta_contiene', label: 'Contiene alguna palabra', grupo: 'Texto del mensaje' },
  { value: 'palabras_clave', label: 'Contiene ALGUNA palabra clave', grupo: 'Texto del mensaje' },
  { value: 'contiene_todas', label: 'Contiene TODAS las palabras', grupo: 'Texto del mensaje' },
  { value: 'es_exactamente', label: 'Es exactamente este texto', grupo: 'Texto del mensaje' },
  { value: 'empieza_con', label: 'Empieza con...', grupo: 'Texto del mensaje' },
  { value: 'termina_con', label: 'Termina con...', grupo: 'Texto del mensaje' },
  { value: 'longitud_mayor', label: 'Longitud mayor a N caracteres', grupo: 'Texto del mensaje' },
  { value: 'es_positivo', label: 'Respuesta positiva (sí/ok/claro...)', grupo: 'Intención detectada' },
  { value: 'es_negativo', label: 'Respuesta negativa (no/tampoco...)', grupo: 'Intención detectada' },
  { value: 'es_numero', label: 'Respuesta es un número', grupo: 'Intención detectada' },
  { value: 'canal', label: 'Canal específico', grupo: 'Contexto del cliente' },
  { value: 'etapa', label: 'Etapa actual es', grupo: 'Contexto del cliente' },
  { value: 'tiene_celular', label: 'Tiene celular registrado', grupo: 'Contexto del cliente' },
  { value: 'es_nuevo', label: 'Es cliente nuevo', grupo: 'Contexto del cliente' },
  { value: 'horario_laboral', label: 'Está en horario laboral', grupo: 'Contexto del cliente' },
  { value: 'etapa_o_posterior', label: 'Etapa: esta o más adelante', grupo: 'Pipeline' },
  { value: 'aprobacion_pendiente', label: 'Aprobación de gerencia pendiente', grupo: 'Pipeline' },
  { value: 'ia_evalua', label: 'IA evalúa si se cumple', grupo: 'Inteligencia Artificial' },
]

const ACCIONES_IA_PUNTUAL = [
  { key: 'resumenes_conversacion', label: 'Generar resumen (texto)' },
  { key: 'sugerencias_respuesta', label: 'Generar respuesta sugerida (texto)' },
  { key: 'clasificacion_intencion', label: 'Clasificar intención del mensaje (texto)' },
  { key: 'transcripcion_audio', label: 'Transcribir audio a texto' },
  { key: 'generar_audio', label: 'Generar audio desde texto (ElevenLabs)' },
  { key: 'generar_imagen', label: 'Generar imagen (OpenAI)' },
] as const

const MODELOS_POR_PROVEEDOR: Record<string, { modelo: string; label: string; ayuda: string }[]> = {
  OPENAI: [
    { modelo: 'gpt-4o-mini', label: 'GPT-4o mini', ayuda: 'El más económico y rápido — ideal para responder rápido sin analizar a fondo.' },
    { modelo: 'gpt-4o', label: 'GPT-4o', ayuda: 'Más capaz — mejor para análisis y redacción compleja. Más lento y más costoso.' },
    { modelo: 'dall-e-3', label: 'DALL-E 3', ayuda: 'Genera imágenes a partir de texto.' },
  ],
  ANTHROPIC: [
    { modelo: 'claude-haiku-4-5-20251001', label: 'Claude Haiku', ayuda: 'Económico y rápido, ideal para tareas simples.' },
    { modelo: 'claude-sonnet-4-6', label: 'Claude Sonnet', ayuda: 'Más capaz, mejor para redacción y análisis complejo.' },
  ],
  GOOGLE: [
    { modelo: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', ayuda: 'Económico y rápido para tareas simples.' },
    { modelo: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', ayuda: 'Más capaz para análisis complejo.' },
  ],
  GROK: [{ modelo: 'grok-2-latest', label: 'Grok 2', ayuda: 'Modelo general de xAI.' }],
  ELEVENLABS: [
    { modelo: 'eleven_turbo_v2_5', label: 'Turbo v2.5', ayuda: 'Rápido y económico, buena calidad de voz.' },
    { modelo: 'eleven_multilingual_v2', label: 'Multilingual v2', ayuda: 'Mejor calidad, más idiomas, más lento.' },
  ],
}

const COLORES_ETIQUETA = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280']

const CATEGORIAS_ACCION: { value: CategoriaAccion; label: string }[] = [
  { value: 'bandeja_entrada', label: '📥 Bandeja de Entrada' },
  { value: 'openai', label: '✨ OpenAI' },
  { value: 'anadir_etiqueta', label: '🏷️ Añadir Etiqueta' },
  { value: 'quitar_etiqueta', label: '🏷️ Quitar Etiqueta' },
  { value: 'notificar_admin', label: '🔔 Notificar a Administradores' },
  { value: 'campo_set', label: '✏️ Establecer Campo Personalizado' },
  { value: 'campo_clear', label: '🧽 Limpiar Campo Personalizado' },
  { value: 'secuencia_sub', label: '📨 Suscribir a Secuencia' },
  { value: 'secuencia_unsub', label: '📭 Dar de baja de Secuencia' },
  { value: 'evento_log', label: '📋 Registro de Evento Personalizado' },
  { value: 'transmision_sub', label: '📡 Suscribir a Transmisiones' },
  { value: 'transmision_unsub', label: '🔕 Dar de baja de Transmisiones' },
  { value: 'borrar_datos_usuario', label: '🧹 Borrar Información del Usuario' },
  { value: 'api_externa', label: '🌐 Solicitud de API Externa' },
  { value: 'disparador', label: '🤝 Disparador (otro flujo)' },
]

const SUBTIPOS_BANDEJA: { value: SubtipoBandeja; label: string }[] = [
  { value: 'transferir_humano', label: 'Transferir a humano' },
  { value: 'transferir_bot', label: 'Transferir a otro bot' },
  { value: 'archivar', label: 'Archivar conversación' },
  { value: 'desarchivar', label: 'Desarchivar conversación' },
  { value: 'marcar_seguimiento', label: 'Marcar seguimiento' },
  { value: 'quitar_seguimiento', label: 'Quitar seguimiento' },
  { value: 'bloquear_usuario', label: 'Bloquear usuario' },
  { value: 'desbloquear_usuario', label: 'Desbloquear usuario' },
  { value: 'anadir_nota', label: 'Añadir nota interna' },
  { value: 'cambiar_etapa', label: 'Cambiar etapa' },
  { value: 'asignar_admin', label: 'Asignar administrador' },
]

// ─── Selector de variable del catálogo del flujo (nombre + tipo) ─────────────
function VariablePicker({ label, value, tipos, variables, onChange, onCrear }: {
  label: string; value: string; tipos?: TipoVariable[]
  variables: VariableDefinida[]; onChange: (nombre: string) => void; onCrear: (v: VariableDefinida) => void
}) {
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTipo, setNuevoTipo] = useState<TipoVariable>('texto')
  const filtradas = tipos ? variables.filter(v => tipos.includes(v.tipo)) : variables

  if (creando) {
    return (
      <div>
        <label className={labelCls}>{label}</label>
        <div className="flex items-center gap-1">
          <input autoFocus value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="nombre_variable" className={inputCls} />
          <select value={nuevoTipo} onChange={e => setNuevoTipo(e.target.value as TipoVariable)} className="border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs">
            {TIPOS_VARIABLE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={() => {
            if (!nuevoNombre.trim()) return
            onCrear({ nombre: nuevoNombre.trim(), tipo: nuevoTipo })
            onChange(nuevoNombre.trim())
            setCreando(false); setNuevoNombre('')
          }} className="text-xs text-blue-600 px-1" title="Crear">✓</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select value={value} onChange={e => {
        if (e.target.value === '__nueva__') setCreando(true)
        else onChange(e.target.value)
      }} className={inputCls}>
        <option value="">Sin seleccionar</option>
        {filtradas.map(v => <option key={v.nombre} value={v.nombre}>{v.nombre} ({TIPOS_VARIABLE.find(t => t.value === v.tipo)?.label})</option>)}
        <option value="__nueva__">+ Nueva variable...</option>
      </select>
    </div>
  )
}

export default function NodeInspector({ node, ctx, allNodes, variables, onCrearVariable, onChange, onClose, onPrev, onNext }: Props) {
  const tipo = node.type ?? ''
  const data = (node.data ?? {}) as Record<string, unknown>
  const upd = (patch: Record<string, unknown>) => onChange(patch)

  const item = tipo === 'accion' ? catalogItem('accion', String(data.categoria ?? '')) : catalogItem(tipo)
  const categoria = item?.categoria ?? 'logica'
  const info = CATEGORIA_INFO[categoria]
  const titulo = tipo === 'trigger' ? 'Disparador' : tipo === 'accion' ? 'Acción' : (item?.label ?? tipo)
  const subtitulo = tipo === 'accion' ? (item?.label ?? '') : info.label

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full flex-shrink-0">
      <div className={`flex items-center gap-2 px-4 py-3 border-b border-gray-100 ${info.bg}`}>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 bg-white ${info.text}`}>{item?.icono ?? '⚡'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-800 truncate">{titulo}</p>
          <p className="text-[10px] text-gray-400">{subtitulo}</p>
        </div>
        <button onClick={onPrev} title="Nodo anterior" className="text-gray-400 hover:text-gray-700 text-sm px-1">↑</button>
        <button onClick={onNext} title="Nodo siguiente" className="text-gray-400 hover:text-gray-700 text-sm px-1">↓</button>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1">×</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tipo === 'trigger' && <TriggerForm data={data} upd={upd} />}
        {tipo === 'mensaje' && <MensajeForm data={data} upd={upd} ctx={ctx} />}
        {tipo === 'media' && <MediaForm data={data} upd={upd} />}
        {tipo === 'plantilla' && <PlantillaForm data={data} upd={upd} ctx={ctx} />}
        {tipo === 'condicion' && <CondicionForm data={data} upd={upd} ctx={ctx} />}
        {tipo === 'dividir_trafico' && <DividirTraficoForm data={data} upd={upd} />}
        {tipo === 'esperar' && <EsperarForm data={data} upd={upd} />}
        {tipo === 'ir_a_nodo' && <IrANodoForm data={data} upd={upd} allNodes={allNodes} nodeId={node.id} />}
        {tipo === 'capturar_dato' && <CapturarDatoForm data={data} upd={upd} variables={variables} onCrearVariable={onCrearVariable} />}
        {tipo === 'menu_opciones' && <MenuOpcionesForm data={data} upd={upd} />}
        {tipo === 'accion' && <AccionForm data={data} upd={upd} ctx={ctx} variables={variables} onCrearVariable={onCrearVariable} />}
        {tipo === 'subflujo' && <SubflujoForm data={data} upd={upd} ctx={ctx} />}
        {tipo === 'fin' && <p className="text-xs text-gray-400">Este nodo termina la ejecución del flujo. No tiene opciones.</p>}
      </div>
    </div>
  )
}

// ─── Trigger ───────────────────────────────────────────────────────────────
function TriggerForm({ data, upd }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <label className={labelCls}>Cuándo activar</label>
        <select value={String(data.trigger_tipo ?? 'mensaje_nuevo')} onChange={e => upd({ trigger_tipo: e.target.value })} className={inputCls}>
          <option value="mensaje_nuevo">Mensaje nuevo de un contacto</option>
          <option value="lead_ad">Lead de anuncio (Facebook Ads)</option>
          <option value="sin_respuesta_24h">Sin respuesta del asesor &gt;24h</option>
          <option value="etapa_cambiada">Etapa de venta cambiada</option>
          <option value="nuevo_cliente">Cliente nuevo creado</option>
        </select>
      </div>
      {data.trigger_tipo === 'etapa_cambiada' && (
        <div>
          <label className={labelCls}>Etapa</label>
          <select value={String(data.etapa_trigger ?? '')} onChange={e => upd({ etapa_trigger: e.target.value })} className={inputCls}>
            <option value="">Cualquier etapa</option>
            {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
      )}
    </>
  )
}

// ─── Mensaje ───────────────────────────────────────────────────────────────
function MensajeForm({ data, upd, ctx }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void; ctx: CatalogCtx }) {
  const botones = (data.botones as { texto: string; valor: string }[] | undefined) ?? []
  const setBoton = (i: number, campo: 'texto' | 'valor', v: string) => {
    const nuevos = [...botones]; nuevos[i] = { ...nuevos[i], [campo]: v }
    upd({ botones: nuevos })
  }
  return (
    <>
      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
        <input type="checkbox" checked={!!data.usar_plantilla} onChange={e => upd({ usar_plantilla: e.target.checked })} />
        Usar plantilla Meta aprobada
      </label>
      {data.usar_plantilla ? (
        <select value={String(data.plantilla_id ?? '')} onChange={e => upd({ plantilla_id: e.target.value })} className={inputCls}>
          <option value="">Seleccionar plantilla...</option>
          {ctx.plantillas.filter(p => p.meta_status === 'aprobada').map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      ) : (
        <textarea value={String(data.contenido ?? '')} onChange={e => upd({ contenido: e.target.value })} rows={4}
          placeholder="Mensaje... usa {{nombre}} {{celular}} {{etapa}} o {mi_variable}" className={`${inputCls} font-mono resize-none`} />
      )}
      <div>
        <label className={labelCls}>Botones de respuesta (hasta 3, opcional)</label>
        <div className="space-y-1.5">
          {[0, 1, 2].map(i => (
            <input key={i} value={botones[i]?.texto ?? ''} onChange={e => setBoton(i, 'texto', e.target.value)}
              placeholder={`Botón ${i + 1}...`} className={inputCls} />
          ))}
        </div>
      </div>
      <p className="text-[10px] text-gray-400">Variables: {'{{nombre}} {{celular}} {{etapa}} {{canal}} {{ultimo_mensaje}}'}, o una guardada: {'{mi_variable}'}</p>
    </>
  )
}

// ─── Media ─────────────────────────────────────────────────────────────────
function MediaForm({ data, upd }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <div>
        <label className={labelCls}>Tipo</label>
        <select value={String(data.media_tipo ?? 'imagen')} onChange={e => upd({ media_tipo: e.target.value })} className={inputCls}>
          <option value="imagen">🖼 Imagen</option>
          <option value="documento">📄 Documento / PDF</option>
          <option value="audio">🎵 Audio</option>
          <option value="video">🎬 Video</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>URL pública del archivo</label>
        <input type="url" value={String(data.media_url ?? '')} onChange={e => upd({ media_url: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Pie de foto (opcional)</label>
        <input type="text" value={String(data.media_caption ?? '')} onChange={e => upd({ media_caption: e.target.value })} className={inputCls} />
      </div>
    </>
  )
}

// ─── Plantilla ─────────────────────────────────────────────────────────────
function PlantillaForm({ data, upd, ctx }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void; ctx: CatalogCtx }) {
  const aprobadas = ctx.plantillas.filter(p => p.meta_status === 'aprobada')
  return (
    <>
      <div>
        <label className={labelCls}>Plantilla aprobada</label>
        <select value={String(data.plantilla_id ?? '')} onChange={e => upd({ plantilla_id: e.target.value })} className={inputCls}>
          <option value="">Seleccionar...</option>
          {aprobadas.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <p className="text-[10px] text-gray-400">Solo para WhatsApp fuera de la ventana de 24h</p>
      {!aprobadas.length && <p className="text-[10px] text-amber-600">⚠ Sin plantillas aprobadas. Crea una en Mensajes → Plantillas</p>}
    </>
  )
}

// ─── Condición ─────────────────────────────────────────────────────────────
type CondSimple = { id: string; tipo: string; valor?: string; agente_id?: string; pregunta?: string }
type Rama = { id: string; nombre?: string; modo?: string; condiciones?: CondSimple[] }

function CondicionForm({ data, upd, ctx }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void; ctx: CatalogCtx }) {
  const ramas = (data.ramas as Rama[] | undefined) ?? []

  const setRamas = (nuevas: Rama[]) => upd({ ramas: nuevas })
  const agregarRama = () => setRamas([...ramas, { id: `rama-${Date.now()}`, nombre: `Camino ${ramas.length + 1}`, modo: 'todas', condiciones: [] }])
  const quitarRama = (idx: number) => setRamas(ramas.filter((_, i) => i !== idx))
  const updRama = (idx: number, patch: Partial<Rama>) => setRamas(ramas.map((r, i) => i === idx ? { ...r, ...patch } : r))
  const agregarCond = (idx: number) => updRama(idx, { condiciones: [...(ramas[idx].condiciones ?? []), { id: `c-${Date.now()}`, tipo: 'respuesta_contiene', valor: '' }] })
  const quitarCond = (idx: number, ci: number) => updRama(idx, { condiciones: (ramas[idx].condiciones ?? []).filter((_, i) => i !== ci) })
  const updCond = (idx: number, ci: number, patch: Partial<CondSimple>) =>
    updRama(idx, { condiciones: (ramas[idx].condiciones ?? []).map((c, i) => i === ci ? { ...c, ...patch } : c) })

  const necesitaTexto = (t: string) => ['respuesta_contiene', 'palabras_clave', 'contiene_todas', 'es_exactamente', 'empieza_con', 'termina_con'].includes(t)

  return (
    <>
      <p className="text-[10px] text-gray-400 leading-tight">Se evalúan en orden — el primer camino que se cumple gana. Si ninguno se cumple, sale por &quot;otro&quot;.</p>
      {ramas.map((rama, idx) => (
        <div key={rama.id} className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-gray-50">
          <div className="flex items-center gap-1.5">
            <input value={rama.nombre ?? ''} onChange={e => updRama(idx, { nombre: e.target.value })} placeholder={`Camino ${idx + 1}`}
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold" />
            <button onClick={() => quitarRama(idx)} className="text-red-400 hover:text-red-600 text-xs px-1">Eliminar</button>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-[11px]">
            <button onClick={() => updRama(idx, { modo: 'todas' })} className={`flex-1 py-1 ${((rama.modo ?? 'todas') === 'todas') ? 'bg-amber-500 text-white font-medium' : 'text-gray-500 bg-white'}`}>Todas (Y)</button>
            <button onClick={() => updRama(idx, { modo: 'cualquiera' })} className={`flex-1 py-1 ${rama.modo === 'cualquiera' ? 'bg-amber-500 text-white font-medium' : 'text-gray-500 bg-white'}`}>Cualquiera (O)</button>
          </div>
          {(rama.condiciones ?? []).map((c, ci) => (
            <div key={c.id} className="bg-white border border-gray-100 rounded-lg p-1.5 space-y-1">
              <div className="flex items-center gap-1">
                <select value={c.tipo} onChange={e => updCond(idx, ci, { tipo: e.target.value })} className="flex-1 border border-gray-200 rounded px-1.5 py-1 text-[11px]">
                  {Object.entries(CONDICIONES_OPCIONES.reduce((acc, o) => { (acc[o.grupo] ??= []).push(o); return acc }, {} as Record<string, typeof CONDICIONES_OPCIONES>))
                    .map(([grupo, opts]) => (
                      <optgroup key={grupo} label={grupo}>
                        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </optgroup>
                    ))}
                </select>
                <button onClick={() => quitarCond(idx, ci)} className="text-red-400 hover:text-red-600 text-xs px-1">×</button>
              </div>
              {necesitaTexto(c.tipo) && (
                <input value={c.valor ?? ''} onChange={e => updCond(idx, ci, { valor: e.target.value })} placeholder="Valor..." className="w-full border border-gray-200 rounded px-1.5 py-1 text-[11px]" />
              )}
              {c.tipo === 'longitud_mayor' && (
                <input type="number" value={c.valor ?? '10'} onChange={e => updCond(idx, ci, { valor: e.target.value })} className="w-full border border-gray-200 rounded px-1.5 py-1 text-[11px]" />
              )}
              {c.tipo === 'canal' && (
                <select value={c.valor ?? ''} onChange={e => updCond(idx, ci, { valor: e.target.value })} className="w-full border border-gray-200 rounded px-1.5 py-1 text-[11px]">
                  <option value="">Cualquier canal</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="messenger">Messenger</option>
                  <option value="instagram">Instagram</option>
                </select>
              )}
              {(c.tipo === 'etapa' || c.tipo === 'etapa_o_posterior') && (
                <select value={c.valor ?? ''} onChange={e => updCond(idx, ci, { valor: e.target.value })} className="w-full border border-gray-200 rounded px-1.5 py-1 text-[11px]">
                  <option value="">Seleccionar etapa...</option>
                  {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              )}
              {c.tipo === 'ia_evalua' && (
                <>
                  <select value={c.agente_id ?? ''} onChange={e => updCond(idx, ci, { agente_id: e.target.value })} className="w-full border border-gray-200 rounded px-1.5 py-1 text-[11px]">
                    <option value="">Agente IA a usar...</option>
                    {ctx.agentes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                  <textarea value={c.pregunta ?? ''} onChange={e => updCond(idx, ci, { pregunta: e.target.value })} rows={2}
                    placeholder="¿El cliente está interesado en comprar?" className="w-full border border-gray-200 rounded px-1.5 py-1 text-[11px] resize-none" />
                </>
              )}
            </div>
          ))}
          <button onClick={() => agregarCond(idx)} className="w-full text-[11px] text-amber-700 border border-dashed border-amber-300 rounded-lg py-1 hover:bg-amber-50">+ Condición</button>
        </div>
      ))}
      <button onClick={agregarRama} className="w-full text-xs text-blue-600 border border-dashed border-gray-300 rounded-lg py-1.5 hover:border-blue-400">+ Añadir camino</button>
    </>
  )
}

// ─── Dividir tráfico ───────────────────────────────────────────────────────
function DividirTraficoForm({ data, upd }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void }) {
  const vars = (data.variaciones as { id: string; nombre: string; porcentaje: number }[] | undefined) ?? []
  const setVars = (nuevas: typeof vars) => upd({ variaciones: nuevas })
  const total = vars.reduce((s, v) => s + (Number(v.porcentaje) || 0), 0)

  const agregar = () => setVars([...vars, { id: `var-${Date.now()}`, nombre: String.fromCharCode(65 + vars.length), porcentaje: 0 }])
  const quitar = (i: number) => setVars(vars.filter((_, idx) => idx !== i))
  const updVar = (i: number, patch: Partial<{ nombre: string; porcentaje: number }>) => setVars(vars.map((v, idx) => idx === i ? { ...v, ...patch } : v))

  return (
    <>
      {vars.map((v, i) => (
        <div key={v.id} className="flex items-center gap-1.5">
          <input value={v.nombre} onChange={e => updVar(i, { nombre: e.target.value })} className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          <input type="number" min={0} max={100} value={v.porcentaje} onChange={e => updVar(i, { porcentaje: Number(e.target.value) })} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          <span className="text-xs text-gray-400">%</span>
          <button onClick={() => quitar(i)} className="text-red-400 hover:text-red-600 text-xs px-1">×</button>
        </div>
      ))}
      <button onClick={agregar} className="w-full text-xs text-blue-600 border border-dashed border-gray-300 rounded-lg py-1.5 hover:border-blue-400">+ Nueva variación</button>
      <p className={`text-[10px] ${total === 100 ? 'text-green-600' : 'text-red-500'}`}>Suma actual: {total}% {total !== 100 && '— debe sumar 100%'}</p>
    </>
  )
}

// ─── Esperar ───────────────────────────────────────────────────────────────
function EsperarForm({ data, upd }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void }) {
  const modo = String(data.modo ?? 'duracion')
  return (
    <>
      <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
        <button onClick={() => upd({ modo: 'duracion' })} className={`flex-1 py-1.5 ${modo === 'duracion' ? 'bg-amber-500 text-white font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>Tiempo fijo</button>
        <button onClick={() => upd({ modo: 'respuesta' })} className={`flex-1 py-1.5 ${modo === 'respuesta' ? 'bg-amber-500 text-white font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>Hasta responder</button>
        <button onClick={() => upd({ modo: 'dias_en_etapa' })} className={`flex-1 py-1.5 ${modo === 'dias_en_etapa' ? 'bg-amber-500 text-white font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>Días en etapa</button>
      </div>
      {modo === 'duracion' && (
        <div className="flex items-center gap-2">
          <input type="number" min={0} value={Number(data.horas ?? 24)} onChange={e => upd({ horas: Number(e.target.value) })} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          <span className="text-xs text-gray-500">horas</span>
          <input type="number" min={0} max={59} value={Number(data.minutos ?? 0)} onChange={e => upd({ minutos: Number(e.target.value) })} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          <span className="text-xs text-gray-500">min</span>
        </div>
      )}
      {modo === 'respuesta' && <p className="text-[10px] text-gray-400">El flujo pausa aquí hasta que el cliente escriba cualquier mensaje. Sin límite de tiempo.</p>}
      {modo === 'dias_en_etapa' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Días sin moverse:</span>
          <input type="number" min={0} value={Number(data.dias ?? 1)} onChange={e => upd({ dias: Number(e.target.value) })} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
        </div>
      )}
    </>
  )
}

// ─── Ir a nodo ─────────────────────────────────────────────────────────────
function IrANodoForm({ data, upd, allNodes, nodeId }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void; allNodes: Node[]; nodeId: string }) {
  const otros = allNodes.filter(n => n.id !== nodeId)
  return (
    <>
      <label className={labelCls}>Saltar a:</label>
      <select value={String(data.nodo_destino_id ?? '')} onChange={e => upd({ nodo_destino_id: e.target.value })} className={inputCls}>
        <option value="">— Seleccionar nodo —</option>
        {otros.map(n => {
          const d = n.data as Record<string, unknown>
          const label = n.type === 'accion' ? catalogItem('accion', String(d.categoria ?? ''))?.label : catalogItem(n.type ?? '')?.label
          return <option key={n.id} value={n.id}>{label ?? n.type}</option>
        })}
      </select>
      <p className="text-[10px] text-gray-400 leading-tight">Pausa el flujo y lo reanuda en ese nodo cuando el cliente escriba su próxima respuesta.</p>
    </>
  )
}

// ─── Capturar dato ─────────────────────────────────────────────────────────
function CapturarDatoForm({ data, upd, variables, onCrearVariable }: {
  data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void
  variables: VariableDefinida[]; onCrearVariable: (v: VariableDefinida) => void
}) {
  const campo = String(data.campo ?? 'nombre')
  return (
    <>
      <div>
        <label className={labelCls}>Pregunta a enviar (opcional)</label>
        <textarea value={String(data.prompt ?? '')} onChange={e => upd({ prompt: e.target.value })} rows={2}
          placeholder="ej: ¿Cuál es tu correo electrónico?" className={`${inputCls} resize-none`} />
        <p className="text-[10px] text-gray-400 mt-1">Si la dejas vacía, el nodo solo guarda lo último que haya escrito el cliente (útil después de un mensaje/menú ya enviado).</p>
      </div>
      <div>
        <label className={labelCls}>Guardar respuesta en</label>
        <select value={campo} onChange={e => upd({ campo: e.target.value })} className={inputCls}>
          <optgroup label="Perfil del cliente">
            <option value="nombre">Nombre del cliente</option>
            <option value="celular">Celular</option>
            <option value="email">Correo electrónico</option>
            <option value="cedula">Número de cédula</option>
          </optgroup>
          <optgroup label="Variable del flujo">
            <option value="variable">Variable personalizada</option>
          </optgroup>
        </select>
      </div>
      {campo === 'variable' && (
        <VariablePicker label="Variable" value={String(data.nombre_variable ?? '')} variables={variables}
          onChange={v => upd({ nombre_variable: v })} onCrear={onCrearVariable} />
      )}
      <div>
        <label className={labelCls}>Validar formato</label>
        <select value={String(data.formato_esperado ?? '')} onChange={e => upd({ formato_esperado: e.target.value })} className={inputCls}>
          <option value="">Sin validar</option>
          <option value="texto">Cualquier texto (no vacío)</option>
          <option value="email">Correo electrónico</option>
          <option value="telefono">Teléfono</option>
          <option value="numero">Número</option>
          <option value="fecha">Fecha</option>
        </select>
      </div>
      {!!data.formato_esperado && (
        <div>
          <label className={labelCls}>Mensaje si no cumple el formato</label>
          <input value={String(data.mensaje_reintento ?? '')} onChange={e => upd({ mensaje_reintento: e.target.value })}
            placeholder="No entendí tu respuesta, ¿puedes intentar de nuevo?" className={inputCls} />
        </div>
      )}
    </>
  )
}

// ─── Menú de opciones ──────────────────────────────────────────────────────
const MATCH_TIPOS = [
  { value: 'numero', label: '# Número' }, { value: 'exacto', label: '= Exacto' },
  { value: 'contiene', label: '⊃ Contiene' }, { value: 'no_contiene', label: '⊄ No contiene' },
]

function MenuOpcionesForm({ data, upd }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void }) {
  const cantidad = Number(data.cantidad ?? 3)
  const opciones = (data.opciones as { etiqueta?: string; tipo_match?: string; valor_match?: string }[] | undefined) ?? []
  const nums = Array.from({ length: cantidad }, (_, i) => i + 1)

  const updCantidad = (n: number) => {
    const nuevas = Array.from({ length: n }, (_, i) => opciones[i] ?? { etiqueta: '', tipo_match: 'numero', valor_match: '' })
    upd({ cantidad: n, opciones: nuevas })
  }
  const updOpcion = (i: number, patch: Record<string, string>) => {
    const nuevas = opciones.map((op, idx) => idx === i ? { ...op, ...patch } : op)
    upd({ opciones: nuevas })
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 whitespace-nowrap">Opciones:</label>
        <select value={cantidad} onChange={e => updCantidad(Number(e.target.value))} className={inputCls}>
          {[2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n} opciones</option>)}
        </select>
      </div>
      {nums.map((n, i) => {
        const op = opciones[i]
        const tipo = op?.tipo_match ?? 'numero'
        return (
          <div key={n} className="border border-gray-200 rounded-lg p-2 space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-green-600 font-bold text-xs w-4">{n}.</span>
              <input value={op?.etiqueta ?? ''} onChange={e => updOpcion(i, { etiqueta: e.target.value })} placeholder="Etiqueta (opcional)" className="flex-1 border border-gray-200 rounded px-1.5 py-1 text-xs" />
            </div>
            <div className="flex items-center gap-1 ml-5">
              <select value={tipo} onChange={e => updOpcion(i, { tipo_match: e.target.value })} className="border border-gray-200 rounded px-1 py-1 text-[10px] bg-gray-50">
                {MATCH_TIPOS.map(mt => <option key={mt.value} value={mt.value}>{mt.label}</option>)}
              </select>
              {tipo !== 'numero'
                ? <input value={op?.valor_match ?? ''} onChange={e => updOpcion(i, { valor_match: e.target.value })} placeholder="texto..." className="flex-1 border border-gray-200 rounded px-1.5 py-1 text-xs" />
                : <span className="text-[10px] text-gray-400">cliente escribe &quot;{n}&quot;</span>}
            </div>
          </div>
        )
      })}
      <p className="text-[10px] text-gray-400">Se evalúan en orden — primera coincidencia gana. Sin coincidencia → &quot;otro&quot;.</p>
    </>
  )
}

// ─── Acción (nodo único: categoría + campos según categoría) ──────────────
function AccionForm({ data, upd, ctx, variables, onCrearVariable }: {
  data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void; ctx: CatalogCtx
  variables: VariableDefinida[]; onCrearVariable: (v: VariableDefinida) => void
}) {
  const categoria = String(data.categoria ?? 'bandeja_entrada')

  return (
    <>
      <div>
        <label className={labelCls}>Categoría de acción</label>
        <select value={categoria} onChange={e => upd({ categoria: e.target.value })} className={inputCls}>
          {CATEGORIAS_ACCION.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {categoria === 'bandeja_entrada' && <BandejaFields data={data} upd={upd} ctx={ctx} />}
      {categoria === 'openai' && <OpenAIFields data={data} upd={upd} ctx={ctx} variables={variables} onCrearVariable={onCrearVariable} />}

      {(categoria === 'anadir_etiqueta' || categoria === 'quitar_etiqueta') && (
        <>
          <div>
            <label className={labelCls}>Etiqueta existente</label>
            <select value={String(data.etiqueta_id ?? '')} onChange={e => upd({ etiqueta_id: e.target.value })} className={inputCls}>
              <option value="">— Seleccionar —</option>
              {ctx.etiquetas.map(et => <option key={et.id} value={et.id}>{et.nombre}</option>)}
            </select>
          </div>
          {categoria === 'anadir_etiqueta' && (
            <div>
              <label className={labelCls}>...o crear una nueva</label>
              <input value={String(data.nueva_etiqueta_nombre ?? '')} onChange={e => upd({ nueva_etiqueta_nombre: e.target.value })} placeholder="Nombre de etiqueta nueva" className={inputCls} />
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                {COLORES_ETIQUETA.map(c => (
                  <button key={c} onClick={() => upd({ nueva_etiqueta_color: c })}
                    className={`w-4 h-4 rounded-full flex-shrink-0 ${String(data.nueva_etiqueta_color ?? '#3b82f6') === c ? 'ring-2 ring-offset-1 ring-gray-500' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {categoria === 'notificar_admin' && (
        <>
          <div><label className={labelCls}>Título</label><input value={String(data.notif_titulo ?? '')} onChange={e => upd({ notif_titulo: e.target.value })} placeholder="Automatización" className={inputCls} /></div>
          <div><label className={labelCls}>Mensaje</label><textarea value={String(data.notif_mensaje ?? '')} onChange={e => upd({ notif_mensaje: e.target.value })} rows={2} className={`${inputCls} resize-none`} /></div>
        </>
      )}

      {categoria === 'campo_set' && (
        <>
          <VariablePicker label="Variable a establecer" value={String(data.variable_nombre ?? '')} variables={variables}
            onChange={v => upd({ variable_nombre: v })} onCrear={onCrearVariable} />
          <div><label className={labelCls}>Valor</label><input value={String(data.variable_valor ?? '')} onChange={e => upd({ variable_valor: e.target.value })} placeholder="Valor fijo o con {{variables.x}}" className={inputCls} /></div>
        </>
      )}

      {categoria === 'campo_clear' && (
        <VariablePicker label="Variable a limpiar" value={String(data.variable_nombre ?? '')} variables={variables}
          onChange={v => upd({ variable_nombre: v })} onCrear={onCrearVariable} />
      )}

      {(categoria === 'secuencia_sub' || categoria === 'secuencia_unsub') && (
        <div>
          <label className={labelCls}>Secuencia</label>
          <select value={String(data.secuencia_id ?? '')} onChange={e => upd({ secuencia_id: e.target.value })} className={inputCls}>
            <option value="">Seleccionar secuencia...</option>
            {ctx.secuencias.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {!ctx.secuencias.length && <p className="text-[10px] text-amber-600 mt-1">⚠ Crea secuencias en Mensajes → Secuencias</p>}
        </div>
      )}

      {categoria === 'evento_log' && (
        <>
          <div><label className={labelCls}>Nombre del evento</label><input value={String(data.variable_valor ?? '')} onChange={e => upd({ variable_valor: e.target.value })} placeholder="ej: solicito_cotizacion" className={inputCls} /></div>
          <div><label className={labelCls}>Datos (JSON, opcional)</label><textarea value={String(data.evento_datos ?? '')} onChange={e => upd({ evento_datos: e.target.value })} rows={2} placeholder='{"producto": "{{variables.moto}}"}' className={`${inputCls} font-mono resize-none`} /></div>
        </>
      )}

      {(categoria === 'transmision_sub' || categoria === 'transmision_unsub') && (
        <p className="text-[10px] text-gray-400">{categoria === 'transmision_sub' ? 'El cliente acepta recibir mensajes masivos futuros.' : 'El cliente deja de recibir mensajes masivos.'}</p>
      )}

      {categoria === 'borrar_datos_usuario' && (
        <p className="text-[10px] text-gray-400">Borra solo las variables que este flujo guardó, no los datos del cliente en el CRM.</p>
      )}

      {categoria === 'api_externa' && (
        <>
          <div className="flex gap-1.5">
            <select value={String(data.api_metodo ?? 'GET')} onChange={e => upd({ api_metodo: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
              <option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="DELETE">DELETE</option>
            </select>
            <input value={String(data.api_url ?? '')} onChange={e => upd({ api_url: e.target.value })} placeholder="https://..." className={`${inputCls} flex-1`} />
          </div>
          <div><label className={labelCls}>Headers (uno por línea, &quot;Nombre: valor&quot;)</label><textarea value={String(data.api_headers ?? '')} onChange={e => upd({ api_headers: e.target.value })} rows={2} className={`${inputCls} font-mono resize-none`} /></div>
          {data.api_metodo !== 'GET' && (
            <div><label className={labelCls}>Body (JSON, admite variables)</label><textarea value={String(data.api_body ?? '')} onChange={e => upd({ api_body: e.target.value })} rows={3} className={`${inputCls} font-mono resize-none`} /></div>
          )}
          <VariablePicker label="Guardar respuesta en" value={String(data.api_variable_respuesta ?? '')} variables={variables}
            onChange={v => upd({ api_variable_respuesta: v })} onCrear={onCrearVariable} />
        </>
      )}

      {categoria === 'disparador' && (
        <div>
          <label className={labelCls}>Flujo a disparar</label>
          <select value={String(data.subflujo_id ?? '')} onChange={e => upd({ subflujo_id: e.target.value })} className={inputCls}>
            <option value="">Seleccionar flujo...</option>
            {ctx.flujos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
          <p className="text-[10px] text-gray-400 mt-1">Entrega la conversación a ese flujo y termina este.</p>
        </div>
      )}
    </>
  )
}

function BandejaFields({ data, upd, ctx }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void; ctx: CatalogCtx }) {
  const subtipo = String(data.subtipo_bandeja ?? 'anadir_nota')
  return (
    <>
      <div>
        <label className={labelCls}>Acción</label>
        <select value={subtipo} onChange={e => upd({ subtipo_bandeja: e.target.value })} className={inputCls}>
          {SUBTIPOS_BANDEJA.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      {subtipo === 'transferir_bot' && (
        <div>
          <label className={labelCls}>Flujo a transferir</label>
          <select value={String(data.subflujo_id ?? '')} onChange={e => upd({ subflujo_id: e.target.value })} className={inputCls}>
            <option value="">Seleccionar flujo...</option>
            {ctx.flujos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </div>
      )}
      {subtipo === 'anadir_nota' && (
        <textarea value={String(data.contenido ?? '')} onChange={e => upd({ contenido: e.target.value })} rows={3}
          placeholder="Nota visible solo para el equipo..." className={`${inputCls} resize-none`} />
      )}
      {subtipo === 'cambiar_etapa' && (
        <div>
          <label className={labelCls}>Nueva etapa</label>
          <select value={String(data.etapa ?? 'nuevo')} onChange={e => upd({ etapa: e.target.value })} className={inputCls}>
            {ETAPAS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </div>
      )}
      {subtipo === 'asignar_admin' && (
        <>
          <select value={String(data.tipo_asignacion ?? 'round_robin')} onChange={e => upd({ tipo_asignacion: e.target.value })} className={inputCls}>
            <option value="round_robin">Round Robin (automático)</option>
            <option value="usuario_fijo">Usuario fijo</option>
          </select>
          {data.tipo_asignacion === 'usuario_fijo' && (
            <select value={String(data.asignar_a ?? '')} onChange={e => upd({ asignar_a: e.target.value })} className={inputCls}>
              <option value="">Seleccionar asesor...</option>
              {ctx.equipo.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          )}
        </>
      )}
      {subtipo === 'bloquear_usuario' && <p className="text-[10px] text-amber-600">Termina la ejecución del flujo — el bot no volverá a escribirle a este cliente hasta que se desbloquee.</p>}
      {subtipo === 'transferir_humano' && <p className="text-[10px] text-amber-600">Termina la ejecución del flujo — queda en manos de un asesor.</p>}
    </>
  )
}

function OpenAIFields({ data, upd, ctx, variables, onCrearVariable }: {
  data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void; ctx: CatalogCtx
  variables: VariableDefinida[]; onCrearVariable: (v: VariableDefinida) => void
}) {
  const modo = String(data.modo ?? 'puntual')
  const integraciones = ctx.integracionesIA.filter(i => i.activo)
  const proveedores = Array.from(new Set(integraciones.map(i => i.proveedor)))
  const proveedor = String(data.proveedor ?? '')
  const integracionSel = integraciones.find(i => i.proveedor === proveedor)
  const accionIA = String(data.accion_ia ?? '')
  const accionesDisp = integracionSel ? ACCIONES_IA_PUNTUAL.filter(a => integracionSel.uso_asignado.includes(a.key)) : []
  const modelos = MODELOS_POR_PROVEEDOR[proveedor] ?? []
  const modeloSel = modelos.find(m => m.modelo === data.modelo)

  return (
    <>
      <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
        <button onClick={() => upd({ modo: 'puntual' })} className={`flex-1 py-1.5 ${modo === 'puntual' ? 'bg-violet-500 text-white font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>Puntual</button>
        <button onClick={() => upd({ modo: 'agente' })} className={`flex-1 py-1.5 ${modo === 'agente' ? 'bg-violet-500 text-white font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>Agente configurado</button>
      </div>

      {modo === 'agente' ? (
        <>
          <div>
            <label className={labelCls}>Agente</label>
            <select value={String(data.agente_id ?? '')} onChange={e => upd({ agente_id: e.target.value })} className={inputCls}>
              <option value="">Seleccionar agente...</option>
              {ctx.agentes.map(a => <option key={a.id} value={a.id}>{a.nombre} ({a.proveedor})</option>)}
            </select>
          </div>
          <textarea value={String(data.prompt_contexto ?? '')} onChange={e => upd({ prompt_contexto: e.target.value })} rows={2}
            placeholder="Contexto adicional para este nodo (opcional)..." className={`${inputCls} resize-none`} />
          <p className="text-[10px] text-gray-400">El agente ya recibe automáticamente el último mensaje del cliente, el historial reciente y lo que tenga habilitado (herramientas para agendar seguimientos, mover el pipeline, escalar a humano, etc.).</p>
          {!ctx.agentes.length && <p className="text-[10px] text-amber-600">⚠ Crea un agente en Mensajes → Agentes IA</p>}
        </>
      ) : (
        <>
          <div>
            <label className={labelCls}>¿Qué IA usar?</label>
            <select value={proveedor} onChange={e => upd({ proveedor: e.target.value, accion_ia: '', modelo: '' })} className={inputCls}>
              <option value="">Seleccionar IA conectada...</option>
              {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {!integraciones.length && <p className="text-[10px] text-amber-600 mt-1">⚠ Sin integraciones IA activas. Conéctalas en Integraciones IA.</p>}
          </div>
          {!!proveedor && (
            <div>
              <label className={labelCls}>Acción (tipo de respuesta)</label>
              <select value={accionIA} onChange={e => upd({ accion_ia: e.target.value })} className={inputCls}>
                <option value="">Seleccionar acción...</option>
                {accionesDisp.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </div>
          )}
          {!!proveedor && !!accionIA && modelos.length > 0 && (
            <div>
              <label className={labelCls}>Modelo</label>
              <select value={String(data.modelo ?? '')} onChange={e => upd({ modelo: e.target.value })} className={inputCls}>
                <option value="">Por defecto de la integración</option>
                {modelos.map(m => <option key={m.modelo} value={m.modelo}>{m.label}</option>)}
              </select>
              {modeloSel && <p className="text-[10px] text-gray-500 mt-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5">{modeloSel.ayuda}</p>}
            </div>
          )}
          {!!proveedor && !!accionIA && (
            <>
              <div>
                <label className={labelCls}>Indicación para la IA (prompt)</label>
                <textarea value={String(data.prompt ?? '')} onChange={e => upd({ prompt: e.target.value })} rows={4}
                  placeholder="Ej: Responde de forma breve y amable, ofreciendo agendar una cita si el cliente pregunta por precios..."
                  className={`${inputCls} resize-none`} />
                <p className="text-[10px] text-gray-400 mt-1">Aquí solo escribes las instrucciones — qué quieres que haga la IA. También puedes usar {'{{nombre}}'} o {'{mi_variable}'} si necesitas datos puntuales.</p>
              </div>

              <div className="border border-gray-200 rounded-lg p-2.5 space-y-2 bg-gray-50">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Información que recibe la IA</p>
                <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={data.incluir_ultimo_mensaje !== false}
                    onChange={e => upd({ incluir_ultimo_mensaje: e.target.checked })} />
                  <span>Último mensaje del cliente <span className="block text-[10px] text-gray-400">Lo que el cliente acaba de escribir</span></span>
                </label>
                <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={!!data.incluir_resumen_conversacion}
                    onChange={e => upd({ incluir_resumen_conversacion: e.target.checked })} />
                  <span>Resumen de la conversación <span className="block text-[10px] text-gray-400">Los últimos mensajes entre el cliente y el bot, para que tenga más contexto</span></span>
                </label>
              </div>
            </>
          )}
        </>
      )}

      <VariablePicker label="Guardar resultado en" value={String(data.variable_nombre ?? '')} variables={variables}
        onChange={v => upd({ variable_nombre: v })} onCrear={onCrearVariable} />
      <p className="text-[10px] text-gray-400 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-2">
        Siempre se guarda en la variable — usa un nodo Mensaje después con {'{'}variable{'}'} para enviarlo al cliente.
      </p>
    </>
  )
}

// ─── Subflujo ──────────────────────────────────────────────────────────────
function SubflujoForm({ data, upd, ctx }: { data: Record<string, unknown>; upd: (p: Record<string, unknown>) => void; ctx: CatalogCtx }) {
  return (
    <>
      <label className={labelCls}>Flujo anidado a ejecutar</label>
      <select value={String(data.subflujo_id ?? '')} onChange={e => upd({ subflujo_id: e.target.value })} className={inputCls}>
        <option value="">Seleccionar flujo...</option>
        {ctx.flujos.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
      </select>
      <p className="text-[10px] text-gray-400">A diferencia de la acción &quot;Disparador&quot;, este nodo sigue corriendo después de llamar al subflujo.</p>
    </>
  )
}
