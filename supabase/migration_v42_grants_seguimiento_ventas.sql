-- ============================================================
-- MIGRACIÓN v42 — Permisos faltantes de Seguimiento Ventas
-- Ejecutar DESPUÉS de migration_v41_tipo_documento.sql
--
-- Las tablas de Seguimiento Ventas (migration_v39) y la tabla
-- recordatorios (migration_v27) solo se le otorgaron permisos a
-- service_role, nunca a "authenticated" — el rol que usa cualquier
-- usuario logueado consultando directo desde el navegador. Por eso
-- la pantalla de Seguimiento Ventas devolvía 403 y no mostraba
-- ningún cliente (ni siquiera los que sí se guardaban bien).
-- El aislamiento por tenant sigue garantizado por las políticas RLS
-- ya existentes — este GRANT solo habilita el acceso a nivel de
-- tabla que faltaba.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON recordatorios TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON historial_propietarios_moto TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  historial_etapas_cliente,
  historial_asignaciones,
  clientes_visibilidad,
  entidades_financieras,
  clientes_credito_estudio,
  motos_catalogo,
  clientes_motos_interes,
  clientes_pasos,
  comentarios_cliente,
  archivos_cliente,
  tipos_recordatorio_automatico,
  plantillas_correo
  TO authenticated;

-- ============================================================
-- FIN MIGRACIÓN v42
-- ============================================================
