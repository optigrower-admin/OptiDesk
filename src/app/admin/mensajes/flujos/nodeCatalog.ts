// ══════════════════════════════════════════════════════════════════════════════
// Catálogo de nodos del constructor de Flujos (taxonomía v2, estilo LucidBot).
// Fuente de verdad para: el menú "+ Añadir", los valores por defecto de cada
// nodo nuevo, y los colores/íconos de acento por categoría.
// ══════════════════════════════════════════════════════════════════════════════
import type { CategoriaNodo, TipoNodo, CategoriaAccion } from '@/types/flujos'

export type Usuario = { id: string; nombre: string }
export type Plantilla = { id: string; nombre: string; meta_status: string; meta_template_name: string | null }
export type AgenteIA = { id: string; nombre: string; proveedor: string }
export type Etiqueta = { id: string; nombre: string; color: string }
export type IntegracionIA = { id: string; proveedor: string; activo: boolean; uso_asignado: string[] }
export type Secuencia = { id: string; nombre: string }

export type CatalogCtx = {
  equipo: Usuario[]
  plantillas: Plantilla[]
  agentes: AgenteIA[]
  flujos: { id: string; nombre: string }[]
  etiquetas: Etiqueta[]
  integracionesIA: IntegracionIA[]
  secuencias: Secuencia[]
}

export interface CatalogItem {
  tipo: TipoNodo
  categoriaAccion?: CategoriaAccion
  categoria: CategoriaNodo
  label: string
  descripcionCorta: string
  icono: string
}

// Nota: las clases de Tailwind van escritas literalmente (no se arman con
// template strings) porque el escaneo JIT de Tailwind solo detecta clases que
// aparecen tal cual en el código fuente.
export const CATEGORIA_INFO: Record<CategoriaNodo, { label: string; border: string; bg: string; text: string; dot: string; ring: string }> = {
  contenido:    { label: 'Contenido',                 border: 'border-l-blue-400',    bg: 'bg-blue-50',    text: 'text-blue-600',    dot: 'bg-blue-400',    ring: 'focus:ring-blue-400' },
  ia:           { label: 'IA',                        border: 'border-l-violet-400',  bg: 'bg-violet-50',  text: 'text-violet-600',  dot: 'bg-violet-400',  ring: 'focus:ring-violet-400' },
  logica:       { label: 'Lógica',                    border: 'border-l-amber-400',   bg: 'bg-amber-50',   text: 'text-amber-600',   dot: 'bg-amber-400',   ring: 'focus:ring-amber-400' },
  captura:      { label: 'Captura',                   border: 'border-l-green-400',   bg: 'bg-green-50',   text: 'text-green-600',   dot: 'bg-green-400',   ring: 'focus:ring-green-400' },
  conversacion: { label: 'Acción',                     border: 'border-l-fuchsia-400', bg: 'bg-fuchsia-50', text: 'text-fuchsia-600', dot: 'bg-fuchsia-400', ring: 'focus:ring-fuchsia-400' },
  estructura:   { label: 'Estructura',                border: 'border-l-cyan-400',    bg: 'bg-cyan-50',    text: 'text-cyan-600',    dot: 'bg-cyan-400',    ring: 'focus:ring-cyan-400' },
}

// Todas las "categorías de acción" son UN SOLO tipo de nodo ('accion') — igual
// que el nodo "Acción" de LucidBot, que primero pregunta qué categoría de
// acción quieres y después muestra los campos de esa categoría específica.
export const CATALOGO: CatalogItem[] = [
  // ── Contenido ──
  { tipo: 'mensaje',   categoria: 'contenido', label: 'Mensaje',           descripcionCorta: 'Envía texto, con variables y hasta 3 botones', icono: '💬' },
  { tipo: 'media',     categoria: 'contenido', label: 'Media',             descripcionCorta: 'Envía imagen, video, PDF o audio',              icono: '📎' },
  { tipo: 'plantilla', categoria: 'contenido', label: 'Plantilla WhatsApp', descripcionCorta: 'Envía una plantilla aprobada por Meta',        icono: '📋' },

  // ── Captura ──
  { tipo: 'capturar_dato', categoria: 'captura', label: 'Capturar dato',   descripcionCorta: 'Pregunta y guarda la respuesta, validando el formato', icono: '💾' },
  { tipo: 'menu_opciones', categoria: 'captura', label: 'Menú de opciones', descripcionCorta: 'El cliente elige una opción y continúa por ese camino', icono: '🔢' },

  // ── Lógica ──
  { tipo: 'condicion',       categoria: 'logica', label: 'Condición',        descripcionCorta: 'Separa el flujo en varios caminos según reglas', icono: '🔀' },
  { tipo: 'dividir_trafico', categoria: 'logica', label: 'Dividir tráfico',  descripcionCorta: 'Reparte clientes al azar entre varios caminos', icono: '🎲' },
  { tipo: 'esperar',         categoria: 'logica', label: 'Esperar',         descripcionCorta: 'Pausa por un tiempo, hasta responder, o días en la etapa', icono: '⏱️' },
  { tipo: 'ir_a_nodo',       categoria: 'logica', label: 'Ir a nodo',       descripcionCorta: 'Salta a otro punto del flujo',                   icono: '↩' },
  { tipo: 'fin',             categoria: 'logica', label: 'Fin',             descripcionCorta: 'Termina la ejecución del flujo',                 icono: '🏁' },

  // ── Acción (nodo único, categoría seleccionable) ──
  { tipo: 'accion', categoriaAccion: 'bandeja_entrada',      categoria: 'conversacion', label: 'Bandeja de Entrada',       descripcionCorta: 'Transferir, archivar, seguimiento, bloquear, notas, asignar', icono: '📥' },
  { tipo: 'accion', categoriaAccion: 'openai',               categoria: 'ia',           label: 'OpenAI',                    descripcionCorta: 'Genera texto/imagen/audio con IA y lo guarda en una variable', icono: '✨' },
  { tipo: 'accion', categoriaAccion: 'anadir_etiqueta',      categoria: 'conversacion', label: 'Añadir Etiqueta',          descripcionCorta: 'Etiqueta al cliente',                             icono: '🏷️' },
  { tipo: 'accion', categoriaAccion: 'quitar_etiqueta',      categoria: 'conversacion', label: 'Quitar Etiqueta',          descripcionCorta: 'Quita una etiqueta del cliente',                  icono: '🏷️' },
  { tipo: 'accion', categoriaAccion: 'notificar_admin',      categoria: 'conversacion', label: 'Notificar a Administradores', descripcionCorta: 'Manda una notificación push al equipo',        icono: '🔔' },
  { tipo: 'accion', categoriaAccion: 'campo_set',             categoria: 'conversacion', label: 'Establecer Campo Personalizado', descripcionCorta: 'Guarda un valor en una variable del flujo',  icono: '✏️' },
  { tipo: 'accion', categoriaAccion: 'campo_clear',           categoria: 'conversacion', label: 'Limpiar Campo Personalizado', descripcionCorta: 'Borra el valor de una variable',              icono: '🧽' },
  { tipo: 'accion', categoriaAccion: 'secuencia_sub',         categoria: 'conversacion', label: 'Suscribir a Secuencia',    descripcionCorta: 'Inscribe al cliente en una secuencia de mensajes', icono: '📨' },
  { tipo: 'accion', categoriaAccion: 'secuencia_unsub',       categoria: 'conversacion', label: 'Dar de baja de Secuencia', descripcionCorta: 'Saca al cliente de una secuencia',                icono: '📭' },
  { tipo: 'accion', categoriaAccion: 'evento_log',            categoria: 'conversacion', label: 'Registro de Evento Personalizado', descripcionCorta: 'Guarda un evento para analizarlo después', icono: '📋' },
  { tipo: 'accion', categoriaAccion: 'transmision_sub',       categoria: 'conversacion', label: 'Suscribir a Transmisiones', descripcionCorta: 'El cliente acepta recibir mensajes masivos',   icono: '📡' },
  { tipo: 'accion', categoriaAccion: 'transmision_unsub',     categoria: 'conversacion', label: 'Dar de baja de Transmisiones', descripcionCorta: 'El cliente deja de recibir mensajes masivos', icono: '🔕' },
  { tipo: 'accion', categoriaAccion: 'borrar_datos_usuario',  categoria: 'conversacion', label: 'Borrar Información del Usuario', descripcionCorta: 'Limpia las variables que el flujo guardó',  icono: '🧹' },
  { tipo: 'accion', categoriaAccion: 'api_externa',           categoria: 'conversacion', label: 'Solicitud de API Externa', descripcionCorta: 'Llama a una URL externa y guarda la respuesta',  icono: '🌐' },
  { tipo: 'accion', categoriaAccion: 'disparador',            categoria: 'conversacion', label: 'Disparador (otro flujo)',  descripcionCorta: 'Entrega la conversación a otro flujo y termina', icono: '🤝' },

  // ── Estructura ──
  { tipo: 'subflujo', categoria: 'estructura', label: 'Subflujo', descripcionCorta: 'Llama a otro flujo ya creado y sigue', icono: '🔗' },
]

export function catalogItem(tipo: string, categoriaAccion?: string): CatalogItem | undefined {
  return CATALOGO.find(c => c.tipo === tipo && (categoriaAccion ? c.categoriaAccion === categoriaAccion : !c.categoriaAccion))
}

export function getDefaultData(tipo: string, ctx: CatalogCtx, categoriaAccion?: string): Record<string, unknown> {
  switch (tipo) {
    case 'trigger':       return { trigger_tipo: 'mensaje_nuevo' }
    case 'mensaje':       return { contenido: '', usar_plantilla: false, plantillas: ctx.plantillas, botones: [] }
    case 'media':         return { media_tipo: 'imagen', media_url: '', media_caption: '' }
    case 'plantilla':     return { plantilla_id: '', plantillas: ctx.plantillas }
    case 'condicion':       return { ramas: [{ id: `rama-${Date.now()}`, nombre: 'Camino 1', modo: 'todas', condiciones: [] }] }
    case 'dividir_trafico': return { variaciones: [
      { id: `var-${Date.now()}-a`, nombre: 'A', porcentaje: 50 },
      { id: `var-${Date.now()}-b`, nombre: 'B', porcentaje: 50 },
    ] }
    case 'esperar':        return { modo: 'duracion', horas: 24, minutos: 0, dias: 1 }
    case 'ir_a_nodo':      return { nodo_destino_id: '' }
    case 'fin':            return {}
    case 'capturar_dato':  return { campo: 'nombre', nombre_variable: '', prompt: '', formato_esperado: '', mensaje_reintento: '' }
    case 'menu_opciones':  return { cantidad: 3, opciones: [
      { etiqueta: '', tipo_match: 'numero', valor_match: '' },
      { etiqueta: '', tipo_match: 'numero', valor_match: '' },
      { etiqueta: '', tipo_match: 'numero', valor_match: '' },
    ] }
    case 'accion': return {
      categoria: categoriaAccion ?? 'bandeja_entrada',
      subtipo_bandeja: 'anadir_nota', contenido: '', etapa: 'nuevo',
      tipo_asignacion: 'round_robin', asignar_a: '', subflujo_id: '',
      modo: 'puntual', agente_id: '', prompt_contexto: '',
      proveedor: '', modelo: '', accion_ia: '', prompt: '', temperatura: '0.7', max_tokens: '800',
      etiqueta_id: '', nueva_etiqueta_nombre: '', nueva_etiqueta_color: '#3b82f6',
      notif_titulo: '', notif_mensaje: '',
      variable_nombre: '', variable_valor: '', evento_datos: '',
      secuencia_id: '', api_url: '', api_metodo: 'GET', api_headers: '', api_body: '', api_variable_respuesta: '',
      equipo: ctx.equipo, etiquetas: ctx.etiquetas, flujos_disponibles: ctx.flujos,
      agentes: ctx.agentes, integracionesIA: ctx.integracionesIA, secuencias: ctx.secuencias,
    }
    case 'subflujo':       return { subflujo_id: '', flujos_disponibles: ctx.flujos }
    default:               return {}
  }
}
