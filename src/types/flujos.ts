// ══════════════════════════════════════════════════════════════════════════════
// Tipos para el sistema de flujos de automatización de OptiDesk
// Taxonomía v2 (estilo LucidBot) — ver plan en .claude/plans, "Decisión 3"
// ══════════════════════════════════════════════════════════════════════════════

import type { Node, Edge } from 'reactflow'

// ─── Tipos de nodo disponibles en el editor ───────────────────────────────────
export type TipoNodo =
  | 'trigger'
  | 'mensaje'
  | 'media'
  | 'plantilla'
  | 'condicion'
  | 'dividir_trafico'
  | 'esperar'
  | 'ir_a_nodo'
  | 'fin'
  | 'capturar_dato'
  | 'menu_opciones'
  | 'accion'
  | 'subflujo'

export type CategoriaNodo =
  | 'contenido' | 'ia' | 'logica' | 'captura' | 'conversacion' | 'estructura'

// ─── Catálogo de variables del flujo (nombre + tipo, reutilizable en todos los nodos) ─
export type TipoVariable = 'texto' | 'numero' | 'fecha' | 'booleano' | 'imagen' | 'audio'

export interface VariableDefinida {
  nombre: string
  tipo: TipoVariable
}

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

export interface BotonMensaje { texto: string; valor: string }

export interface DatosMensaje {
  contenido: string
  usar_plantilla?: boolean
  plantilla_id?: string
  botones?: BotonMensaje[]  // hasta 3
}

export interface DatosMedia {
  media_tipo: 'imagen' | 'documento' | 'audio' | 'video'
  media_url: string
  media_caption?: string
  media_filename?: string
}

export interface DatosPlantilla {
  plantilla_id: string
  variables?: Record<string, string>
}

// Nodo único "Acción" (estilo LucidBot): una categoría de acción + sus campos.
// Todos los campos son opcionales acá porque solo aplican algunos según la
// categoría elegida — el motor y el panel de edición sí saben cuáles usar.
export type CategoriaAccion =
  | 'bandeja_entrada'
  | 'openai'
  | 'anadir_etiqueta' | 'quitar_etiqueta'
  | 'notificar_admin'
  | 'campo_set' | 'campo_clear'
  | 'secuencia_sub' | 'secuencia_unsub'
  | 'evento_log'
  | 'transmision_sub' | 'transmision_unsub'
  | 'borrar_datos_usuario'
  | 'api_externa'
  | 'disparador'

export type SubtipoBandeja =
  | 'transferir_humano' | 'transferir_bot'
  | 'archivar' | 'desarchivar'
  | 'marcar_seguimiento' | 'quitar_seguimiento'
  | 'bloquear_usuario' | 'desbloquear_usuario'
  | 'anadir_nota'
  | 'cambiar_etapa'
  | 'asignar_admin'

export interface DatosAccion {
  categoria: CategoriaAccion

  // bandeja_entrada
  subtipo_bandeja?: SubtipoBandeja
  contenido?: string                              // anadir_nota
  etapa?: string                                   // cambiar_etapa
  tipo_asignacion?: 'round_robin' | 'usuario_fijo' // asignar_admin
  asignar_a?: string
  subflujo_id?: string                             // transferir_bot / disparador

  // openai — SIEMPRE guarda en variable, nunca auto-envía (el usuario decide
  // si la usa en un nodo Mensaje aparte con {variable})
  modo?: 'agente' | 'puntual'
  agente_id?: string
  prompt_contexto?: string
  proveedor?: string
  modelo?: string
  accion_ia?: string   // uso: resumenes_conversacion | sugerencias_respuesta | ...
  prompt?: string
  temperatura?: number
  max_tokens?: number
  incluir_ultimo_mensaje?: boolean    // modo puntual — agrega el último mensaje del cliente al prompt
  incluir_resumen_conversacion?: boolean  // modo puntual — agrega el historial reciente al prompt

  // anadir_etiqueta / quitar_etiqueta
  etiqueta_id?: string
  nueva_etiqueta_nombre?: string
  nueva_etiqueta_color?: string

  // notificar_admin
  notif_titulo?: string
  notif_mensaje?: string

  // campo_set / campo_clear / openai (salida) / evento_log (nombre del evento)
  variable_nombre?: string   // nombre de una variable del catálogo del flujo
  variable_valor?: string    // campo_set: valor (admite {{}}); evento_log: se usa como nombre del evento
  evento_datos?: string      // JSON opcional para evento_log

  // secuencia_sub / secuencia_unsub
  secuencia_id?: string

  // api_externa
  api_url?: string
  api_metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  api_headers?: string   // una línea por header, formato "Nombre: valor"
  api_body?: string      // JSON, admite variables
  api_variable_respuesta?: string
}

// Todos los tipos de condición simple evaluables (se reutilizan igual en el motor)
export type CondicionTipoSimple =
  | 'respuesta_contiene' | 'palabras_clave' | 'contiene_todas' | 'es_exactamente'
  | 'empieza_con' | 'termina_con' | 'longitud_mayor'
  | 'es_positivo' | 'es_negativo' | 'es_numero'
  | 'canal' | 'etapa' | 'tiene_celular' | 'es_nuevo' | 'horario_laboral'
  | 'etapa_o_posterior' | 'aprobacion_pendiente'
  | 'ia_evalua'

export interface CondicionSimple {
  id: string
  tipo: CondicionTipoSimple
  valor?: string
  agente_id?: string        // solo ia_evalua
  pregunta?: string         // solo ia_evalua
}

export interface RamaCondicion {
  id: string
  nombre?: string
  modo: 'todas' | 'cualquiera'
  condiciones: CondicionSimple[]
}

export interface DatosCondicion {
  ramas: RamaCondicion[]  // se evalúan en orden; primera que matchea gana; si ninguna matchea sale por "default"
}

export interface VariacionTrafico { id: string; nombre: string; porcentaje: number }

export interface DatosDividirTrafico {
  variaciones: VariacionTrafico[]  // deben sumar 100
}

export interface DatosEsperar {
  modo: 'duracion' | 'respuesta' | 'dias_en_etapa'
  horas?: number       // modo duracion
  minutos?: number     // modo duracion
  dias?: number        // modo dias_en_etapa
}

export interface DatosCapturarDato {
  campo: 'nombre' | 'celular' | 'email' | 'cedula' | 'variable'
  nombre_variable?: string
  prompt?: string                 // si viene, el nodo envía esta pregunta antes de esperar respuesta
  formato_esperado?: 'texto' | 'email' | 'telefono' | 'numero' | 'fecha'
  mensaje_reintento?: string
}

export interface DatosMenuOpcion {
  etiqueta?: string
  tipo_match: 'numero' | 'exacto' | 'contiene' | 'no_contiene'
  valor_match?: string
}

export interface DatosMenuOpciones {
  cantidad: number
  opciones?: DatosMenuOpcion[]
}

export interface DatosSubflujo {
  subflujo_id: string
  nombre_subflujo?: string
}

// ─── Estructura de nodo completa ──────────────────────────────────────────────
export type DatosNodo =
  | (DatosTrigger & { tipo: 'trigger' })
  | (DatosMensaje & { tipo: 'mensaje' })
  | (DatosMedia & { tipo: 'media' })
  | (DatosPlantilla & { tipo: 'plantilla' })
  | (DatosCondicion & { tipo: 'condicion' })
  | (DatosDividirTrafico & { tipo: 'dividir_trafico' })
  | (DatosEsperar & { tipo: 'esperar' })
  | ({ tipo: 'ir_a_nodo'; nodo_destino_id: string })
  | ({ tipo: 'fin' })
  | (DatosCapturarDato & { tipo: 'capturar_dato' })
  | (DatosMenuOpciones & { tipo: 'menu_opciones' })
  | (DatosAccion & { tipo: 'accion' })
  | (DatosSubflujo & { tipo: 'subflujo' })

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
  grupo: string
  nodos: NodosGuardados | null
  variables_definidas: VariableDefinida[]
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
  resumen_conversacion?: string
  etapa_actual?: string
  assigned_to?: string
  variables?: Record<string, string>   // datos capturados por nodos capturar_dato + variables personalizadas
  respuestas?: Record<string, string>  // respuestas de IA o formularios
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
