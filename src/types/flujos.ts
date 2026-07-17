// ══════════════════════════════════════════════════════════════════════════════
// Tipos para el sistema de flujos de automatización de OptiDesk
// ══════════════════════════════════════════════════════════════════════════════

import type { Node, Edge } from 'reactflow'

// ─── Tipos de nodo disponibles en el editor ───────────────────────────────────
export type TipoNodo =
  | 'trigger'
  | 'mensaje'
  | 'asignar'
  | 'esperar'
  | 'etapa'
  | 'condicion'
  | 'agente_ia'
  | 'plantilla'
  | 'media'
  | 'nota_interna'
  | 'etiqueta'
  | 'subflujo'
  | 'capturar_dato'
  | 'fin'

// ─── Tipos de disparador ──────────────────────────────────────────────────────
export type TriggerTipo =
  | 'mensaje_nuevo'
  | 'lead_ad'
  | 'sin_respuesta_24h'
  | 'etapa_cambiada'
  | 'nuevo_cliente'

// ─── Datos de cada tipo de nodo ───────────────────────────────────────────────
export interface DatosTrigger {
  trigger_tipo: TriggerTipo
  etapa_trigger?: string   // solo para trigger_tipo === 'etapa_cambiada'
  canal_trigger?: string   // filtrar por canal (whatsapp/messenger/instagram/todos)
}

export interface DatosMensaje {
  contenido: string
  usar_plantilla?: boolean
  plantilla_id?: string
}

export interface DatosAsignar {
  tipo_asignacion: 'round_robin' | 'usuario_fijo'
  asignar_a?: string
  equipo?: { id: string; nombre: string }[]
}

export interface DatosEsperar {
  horas?: number
  minutos?: number
}

export interface DatosEtapa {
  etapa: string
}

export interface DatosCondicion {
  condicion_tipo: 'etiqueta' | 'canal' | 'respuesta_contiene' | 'etapa' | 'tiene_celular' | 'es_nuevo'
  condicion_valor?: string
}

export interface DatosAgenteIA {
  agente_id: string
  prompt_contexto?: string
  incluir_historial?: boolean
}

export interface DatosPlantilla {
  plantilla_id: string
  variables?: Record<string, string>  // key: variable name, value: static value or {{var}}
}

export interface DatosMedia {
  media_tipo: 'imagen' | 'documento' | 'audio' | 'video'
  media_url: string
  media_caption?: string
  media_filename?: string
}

export interface DatosNotaInterna {
  contenido: string
}

export interface DatosSubflujo {
  subflujo_id: string
  nombre_subflujo?: string
}

export interface DatosCapturarDato {
  campo: 'nombre' | 'celular' | 'email' | 'cedula' | 'variable'
  nombre_variable?: string  // solo cuando campo === 'variable'
}

// ─── Estructura de nodo completa ──────────────────────────────────────────────
export type DatosNodo =
  | (DatosTrigger & { tipo: 'trigger' })
  | (DatosMensaje & { tipo: 'mensaje' })
  | (DatosAsignar & { tipo: 'asignar' })
  | (DatosEsperar & { tipo: 'esperar' })
  | (DatosEtapa & { tipo: 'etapa' })
  | (DatosCondicion & { tipo: 'condicion' })
  | (DatosAgenteIA & { tipo: 'agente_ia' })
  | (DatosPlantilla & { tipo: 'plantilla' })
  | (DatosMedia & { tipo: 'media' })
  | (DatosNotaInterna & { tipo: 'nota_interna' })
  | (DatosSubflujo & { tipo: 'subflujo' })
  | (DatosCapturarDato & { tipo: 'capturar_dato' })
  | ({ tipo: 'fin' })

// ─── Estructura del flujo guardado en DB (nodos JSONB) ────────────────────────
export interface NodosGuardados {
  nodes: Node[]
  edges: Edge[]
}

// ─── Flujo completo desde DB ──────────────────────────────────────────────────
export interface Flujo {
  id: string
  tenant_id: string
  nombre: string
  descripcion: string | null
  trigger_tipo: TriggerTipo
  nodos: NodosGuardados | null
  activo: boolean
  created_at: string
  updated_at: string
}

// ─── Ejecución de un flujo ────────────────────────────────────────────────────
export interface FlujoEjecucion {
  id: string
  tenant_id: string
  flujo_id: string
  conversacion_id: string | null
  cliente_id: string | null
  estado: 'activo' | 'pausado' | 'completado' | 'error' | 'cancelado'
  nodo_actual_id: string | null
  contexto: ContextoEjecucion
  proxima_ejecucion_at: string | null
  ultimo_error: string | null
  pasos_ejecutados: number
  created_at: string
  updated_at: string
}

// ─── Contexto de variables disponibles durante la ejecución ──────────────────
export interface ContextoEjecucion {
  nombre_cliente?: string
  celular_cliente?: string
  canal?: string
  ultimo_mensaje?: string
  etapa_actual?: string
  assigned_to?: string
  variables?: Record<string, string>   // datos capturados por nodos capturar_dato + variables personalizadas
  respuestas?: Record<string, string>  // respuestas de agentes IA o formularios
}

// ─── Agente IA ────────────────────────────────────────────────────────────────
export interface AgenteIA {
  id: string
  tenant_id: string
  nombre: string
  proveedor: 'openai' | 'anthropic' | 'elevenlabs'
  modelo: string | null
  prompt_sistema: string | null
  instrucciones: string | null
  temperatura: number
  max_tokens: number
  activo: boolean
  created_at: string
  updated_at: string
}

// ─── Config APIs IA ───────────────────────────────────────────────────────────
export interface ConfigApisIA {
  tenant_id: string
  openai_key_enc: string | null
  anthropic_key_enc: string | null
  elevenlabs_key_enc: string | null
  openai_modelo_default: string
  anthropic_modelo_default: string
  elevenlabs_voz_id: string | null
  updated_at: string
}
