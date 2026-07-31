// ══════════════════════════════════════════════════════════════════════════════
// Catálogo de nodos del constructor de Flujos (taxonomía v2, estilo LucidBot).
// Fuente de verdad para: el menú "+ Añadir", los valores por defecto de cada
// nodo nuevo, y los colores/íconos de acento por categoría.
// ══════════════════════════════════════════════════════════════════════════════
import type { CategoriaNodo, TipoNodo, SubtipoAccionConversacion } from '@/types/flujos'

export type Usuario = { id: string; nombre: string }
export type Plantilla = { id: string; nombre: string; meta_status: string; meta_template_name: string | null }
export type AgenteIA = { id: string; nombre: string; proveedor: string }
export type Etiqueta = { id: string; nombre: string; color: string }
export type IntegracionIA = { id: string; proveedor: string; activo: boolean; uso_asignado: string[] }

export type CatalogCtx = {
  equipo: Usuario[]
  plantillas: Plantilla[]
  agentes: AgenteIA[]
  flujos: { id: string; nombre: string }[]
  etiquetas: Etiqueta[]
  integracionesIA: IntegracionIA[]
}

export interface CatalogItem {
  tipo: TipoNodo
  subtipo?: SubtipoAccionConversacion
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
  conversacion: { label: 'Acciones de conversación',  border: 'border-l-fuchsia-400', bg: 'bg-fuchsia-50', text: 'text-fuchsia-600', dot: 'bg-fuchsia-400', ring: 'focus:ring-fuchsia-400' },
  estructura:   { label: 'Estructura',                border: 'border-l-cyan-400',    bg: 'bg-cyan-50',    text: 'text-cyan-600',    dot: 'bg-cyan-400',    ring: 'focus:ring-cyan-400' },
}

export const CATALOGO: CatalogItem[] = [
  // ── Contenido ──
  { tipo: 'mensaje',   categoria: 'contenido', label: 'Mensaje',           descripcionCorta: 'Envía texto, con variables y hasta 3 botones', icono: '💬' },
  { tipo: 'media',     categoria: 'contenido', label: 'Media',             descripcionCorta: 'Envía imagen, video, PDF o audio',              icono: '📎' },
  { tipo: 'plantilla', categoria: 'contenido', label: 'Plantilla WhatsApp', descripcionCorta: 'Envía una plantilla aprobada por Meta',        icono: '📋' },

  // ── IA ──
  { tipo: 'ia_generar_texto', categoria: 'ia', label: 'IA: Generar texto', descripcionCorta: 'Le pide a la IA que redacte una respuesta', icono: '✨' },

  // ── Captura ──
  { tipo: 'capturar_dato', categoria: 'captura', label: 'Capturar dato',   descripcionCorta: 'Pregunta y guarda la respuesta, validando el formato', icono: '💾' },
  { tipo: 'menu_opciones', categoria: 'captura', label: 'Menú de opciones', descripcionCorta: 'El cliente elige una opción y continúa por ese camino', icono: '🔢' },

  // ── Lógica ──
  { tipo: 'condicion',       categoria: 'logica', label: 'Condición',        descripcionCorta: 'Separa el flujo en varios caminos según reglas', icono: '🔀' },
  { tipo: 'dividir_trafico', categoria: 'logica', label: 'Dividir tráfico',  descripcionCorta: 'Reparte clientes al azar entre varios caminos', icono: '🎲' },
  { tipo: 'esperar',         categoria: 'logica', label: 'Esperar',         descripcionCorta: 'Pausa por un tiempo, hasta responder, o días en la etapa', icono: '⏱️' },
  { tipo: 'ir_a_nodo',       categoria: 'logica', label: 'Ir a nodo',       descripcionCorta: 'Salta a otro punto del flujo',                   icono: '↩' },
  { tipo: 'fin',             categoria: 'logica', label: 'Fin',             descripcionCorta: 'Termina la ejecución del flujo',                 icono: '🏁' },

  // ── Acciones de conversación ──
  { tipo: 'accion_conversacion', subtipo: 'transferir_humano',   categoria: 'conversacion', label: 'Transferir a humano',    descripcionCorta: 'Termina la automatización y avisa a un asesor', icono: '🙋' },
  { tipo: 'accion_conversacion', subtipo: 'transferir_bot',      categoria: 'conversacion', label: 'Transferir a otro bot',  descripcionCorta: 'Entrega la conversación a otro flujo',           icono: '🤝' },
  { tipo: 'accion_conversacion', subtipo: 'archivar',            categoria: 'conversacion', label: 'Archivar conversación',  descripcionCorta: 'Marca la conversación como archivada',           icono: '🗄️' },
  { tipo: 'accion_conversacion', subtipo: 'desarchivar',         categoria: 'conversacion', label: 'Desarchivar conversación', descripcionCorta: 'Vuelve a abrir la conversación',               icono: '📤' },
  { tipo: 'accion_conversacion', subtipo: 'marcar_seguimiento',  categoria: 'conversacion', label: 'Marcar seguimiento',     descripcionCorta: 'Pone la conversación en Seguimiento',            icono: '📌' },
  { tipo: 'accion_conversacion', subtipo: 'quitar_seguimiento',  categoria: 'conversacion', label: 'Quitar seguimiento',     descripcionCorta: 'Saca la conversación de Seguimiento',            icono: '📍' },
  { tipo: 'accion_conversacion', subtipo: 'bloquear_usuario',    categoria: 'conversacion', label: 'Bloquear usuario',       descripcionCorta: 'El bot deja de responderle a este cliente',      icono: '🚫' },
  { tipo: 'accion_conversacion', subtipo: 'desbloquear_usuario', categoria: 'conversacion', label: 'Desbloquear usuario',    descripcionCorta: 'El bot vuelve a poder responderle',              icono: '✅' },
  { tipo: 'accion_conversacion', subtipo: 'anadir_nota',         categoria: 'conversacion', label: 'Añadir nota interna',    descripcionCorta: 'Nota visible solo para el equipo',               icono: '📝' },
  { tipo: 'accion_conversacion', subtipo: 'anadir_etiqueta',     categoria: 'conversacion', label: 'Añadir etiqueta',        descripcionCorta: 'Etiqueta al cliente',                             icono: '🏷️' },
  { tipo: 'accion_conversacion', subtipo: 'quitar_etiqueta',     categoria: 'conversacion', label: 'Quitar etiqueta',        descripcionCorta: 'Quita una etiqueta del cliente',                  icono: '🏷️' },
  { tipo: 'accion_conversacion', subtipo: 'cambiar_etapa',       categoria: 'conversacion', label: 'Cambiar etapa',          descripcionCorta: 'Mueve al cliente a otra etapa del pipeline',      icono: '📊' },
  { tipo: 'accion_conversacion', subtipo: 'asignar_admin',       categoria: 'conversacion', label: 'Asignar administrador',  descripcionCorta: 'Asigna la conversación a un asesor',             icono: '👤' },
  { tipo: 'accion_conversacion', subtipo: 'borrar_datos_usuario', categoria: 'conversacion', label: 'Borrar datos capturados', descripcionCorta: 'Limpia las variables que el flujo guardó',      icono: '🧹' },

  // ── Estructura ──
  { tipo: 'subflujo', categoria: 'estructura', label: 'Subflujo', descripcionCorta: 'Llama a otro flujo ya creado y sigue', icono: '🔗' },
]

export function catalogItem(tipo: string, subtipo?: string): CatalogItem | undefined {
  return CATALOGO.find(c => c.tipo === tipo && (subtipo ? c.subtipo === subtipo : !c.subtipo))
}

export function getDefaultData(tipo: string, ctx: CatalogCtx, subtipo?: string): Record<string, unknown> {
  switch (tipo) {
    case 'trigger':       return { trigger_tipo: 'mensaje_nuevo' }
    case 'mensaje':       return { contenido: '', usar_plantilla: false, plantillas: ctx.plantillas, botones: [] }
    case 'media':         return { media_tipo: 'imagen', media_url: '', media_caption: '' }
    case 'plantilla':     return { plantilla_id: '', plantillas: ctx.plantillas }
    case 'ia_generar_texto': return {
      modo: 'puntual', agente_id: '', prompt_contexto: '', incluir_historial: true,
      accion: '', proveedor: '', modelo: '', prompt: '', variable_salida: '',
      temperatura: '0.7', max_tokens: '800', enviar_automaticamente: true,
      agentes: ctx.agentes, integracionesIA: ctx.integracionesIA,
    }
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
    case 'accion_conversacion': return {
      subtipo: subtipo ?? 'anadir_nota',
      contenido: '', etiqueta_id: '', nueva_etiqueta_nombre: '', nueva_etiqueta_color: '#3b82f6',
      etapa: 'nuevo', tipo_asignacion: 'round_robin', asignar_a: '', subflujo_id: '',
      equipo: ctx.equipo, etiquetas: ctx.etiquetas, flujos_disponibles: ctx.flujos,
    }
    case 'subflujo':       return { subflujo_id: '', flujos_disponibles: ctx.flujos }
    default:               return {}
  }
}
