// Whitelist de tablas de negocio consultables desde "Consultas SQL".
// Todas tienen tenant_id (se excluyeron a propósito items_orden,
// clientes_visibilidad, clientes_motos_interes y cotizaciones_servtec_items
// porque no tienen tenant_id propio y no se pueden aislar por tenant de forma
// segura en una consulta SQL directa).
//
// Esta misma lista es la fuente de verdad para:
//  1. El árbol de tablas del sidebar del editor.
//  2. La validación en backend de qué tablas puede tocar una query.
//  3. Los GRANT SELECT del rol de Postgres de solo lectura
//     (supabase/setup_rol_readonly_sql_console.sql) — si agregas una tabla
//     aquí, agrégale también su GRANT SELECT en ese script.

export interface TablaWhitelist {
  tabla: string
  modulo: string
  descripcion: string
}

export const TABLAS_WHITELIST: TablaWhitelist[] = [
  // Servicio Técnico
  { tabla: 'ordenes', modulo: 'Servicio Técnico', descripcion: 'Órdenes de servicio técnico' },
  { tabla: 'pagos_orden', modulo: 'Servicio Técnico', descripcion: 'Pagos aplicados a una orden' },
  { tabla: 'medios', modulo: 'Servicio Técnico', descripcion: 'Fotos/videos de una orden' },
  { tabla: 'manuales_partes', modulo: 'Servicio Técnico', descripcion: 'Manuales de partes' },
  { tabla: 'pagos_proveedor', modulo: 'Servicio Técnico', descripcion: 'Pagos a proveedores por orden' },
  { tabla: 'comentarios_orden', modulo: 'Servicio Técnico', descripcion: 'Comentarios internos de una orden' },
  { tabla: 'cotizaciones_servtec', modulo: 'Servicio Técnico', descripcion: 'Cotizaciones de servicio técnico' },

  // Repuestos / Inventario
  { tabla: 'repuestos_uma', modulo: 'Repuestos', descripcion: 'Catálogo de repuestos UMA' },
  { tabla: 'repuestos_externos', modulo: 'Repuestos', descripcion: 'Catálogo de repuestos externos' },
  { tabla: 'movimientos_inventario', modulo: 'Repuestos', descripcion: 'Movimientos de inventario' },
  { tabla: 'proveedores', modulo: 'Repuestos', descripcion: 'Proveedores' },

  // Clientes
  { tabla: 'clientes', modulo: 'Clientes', descripcion: 'Clientes' },
  { tabla: 'clientes_bonos', modulo: 'Clientes', descripcion: 'Bonos aplicados a clientes' },
  { tabla: 'clientes_credito_estudio', modulo: 'Clientes', descripcion: 'Estudios de crédito por entidad' },
  { tabla: 'clientes_pasos', modulo: 'Clientes', descripcion: 'Pasos del pipeline por cliente' },
  { tabla: 'clientes_pagos', modulo: 'Clientes', descripcion: 'Pagos registrados a clientes' },
  { tabla: 'clientes_etiquetas', modulo: 'Clientes', descripcion: 'Etiquetas de clientes' },
  { tabla: 'comentarios_cliente', modulo: 'Clientes', descripcion: 'Comentarios sobre un cliente' },
  { tabla: 'notas_cliente', modulo: 'Clientes', descripcion: 'Notas de un cliente' },
  { tabla: 'notas_perfil', modulo: 'Clientes', descripcion: 'Notas de perfil' },
  { tabla: 'medios_perfil', modulo: 'Clientes', descripcion: 'Media de perfil' },
  { tabla: 'archivos_cliente', modulo: 'Clientes', descripcion: 'Archivos adjuntos de clientes' },
  { tabla: 'cliente_campos_custom', modulo: 'Clientes', descripcion: 'Campos personalizados de clientes' },
  { tabla: 'entidades_financieras', modulo: 'Clientes', descripcion: 'Entidades financieras (bancos)' },
  { tabla: 'contactos_internos', modulo: 'Clientes', descripcion: 'Contactos internos' },

  // Ventas
  { tabla: 'ventas_motos', modulo: 'Ventas', descripcion: 'Ventas de motos' },
  { tabla: 'motos', modulo: 'Ventas', descripcion: 'Motos propias (inventario)' },
  { tabla: 'motos_catalogo', modulo: 'Ventas', descripcion: 'Catálogo de motos' },
  { tabla: 'motos_catalogo_fotos', modulo: 'Ventas', descripcion: 'Fotos del catálogo' },
  { tabla: 'motos_catalogo_colores', modulo: 'Ventas', descripcion: 'Colores del catálogo' },
  { tabla: 'historial_propietarios_moto', modulo: 'Ventas', descripcion: 'Historial de propietarios de una moto' },
  { tabla: 'historial_etapas', modulo: 'Ventas', descripcion: 'Historial de etapas de venta' },
  { tabla: 'historial_etapas_cliente', modulo: 'Ventas', descripcion: 'Historial de etapas por cliente' },
  { tabla: 'historial_asignaciones', modulo: 'Ventas', descripcion: 'Historial de asignaciones de asesor' },
  { tabla: 'recordatorios', modulo: 'Ventas', descripcion: 'Recordatorios de seguimiento' },
  { tabla: 'leads_campana', modulo: 'Ventas', descripcion: 'Leads de campañas' },
  { tabla: 'pipelines_venta', modulo: 'Ventas', descripcion: 'Pipelines de venta' },
  { tabla: 'pipeline_grupos', modulo: 'Ventas', descripcion: 'Grupos de etapas del pipeline' },
  { tabla: 'etapas_pipeline', modulo: 'Ventas', descripcion: 'Etapas del pipeline' },
  { tabla: 'bonos', modulo: 'Ventas', descripcion: 'Catálogo de bonos' },
  { tabla: 'cotizaciones', modulo: 'Ventas', descripcion: 'Cotizaciones de venta' },

  // Mensajería
  { tabla: 'conversaciones', modulo: 'Mensajería', descripcion: 'Conversaciones' },
  { tabla: 'mensajes', modulo: 'Mensajería', descripcion: 'Mensajes' },
  { tabla: 'plantillas_mensajes', modulo: 'Mensajería', descripcion: 'Plantillas de WhatsApp' },
  { tabla: 'plantillas_correo', modulo: 'Mensajería', descripcion: 'Plantillas de correo' },
  { tabla: 'config_meta', modulo: 'Mensajería', descripcion: 'Configuración de Meta (WhatsApp/FB)' },
  { tabla: 'config_mensajeria', modulo: 'Mensajería', descripcion: 'Configuración de mensajería' },
  { tabla: 'publicaciones', modulo: 'Mensajería', descripcion: 'Publicaciones' },
  { tabla: 'comentarios', modulo: 'Mensajería', descripcion: 'Comentarios de publicaciones' },

  // Caja
  { tabla: 'gastos_caja', modulo: 'Caja', descripcion: 'Gastos de caja' },
  { tabla: 'ingresos_caja', modulo: 'Caja', descripcion: 'Ingresos manuales a caja' },
  { tabla: 'ajustes_caja', modulo: 'Caja', descripcion: 'Ajustes de caja' },
  { tabla: 'cierres_diarios_caja', modulo: 'Caja', descripcion: 'Cierres diarios de caja' },
  { tabla: 'pagos_colaborador_caja', modulo: 'Caja', descripcion: 'Pagos a colaboradores desde caja' },

  // Documentos
  { tabla: 'documentos_internos', modulo: 'Documentos', descripcion: 'Documentos internos' },
]

export const NOMBRES_TABLAS_WHITELIST = new Set(TABLAS_WHITELIST.map(t => t.tabla))

export function tablasPorModulo(): Record<string, TablaWhitelist[]> {
  const out: Record<string, TablaWhitelist[]> = {}
  for (const t of TABLAS_WHITELIST) {
    if (!out[t.modulo]) out[t.modulo] = []
    out[t.modulo].push(t)
  }
  return out
}
