-- ============================================================
-- MIGRACIÓN v54 — Grants faltantes en manuales_partes
--
-- La v53 creó la tabla con RLS pero, como en este proyecto los grants
-- de Postgres a nivel de tabla están bloqueados por defecto para el
-- rol "authenticated" (ver migration_v23_service_role_grants.sql),
-- faltaba habilitar explícitamente el acceso. Sin esto, aunque las
-- políticas RLS sean correctas, toda consulta devuelve
-- "permission denied for table manuales_partes".
-- ============================================================

GRANT SELECT, INSERT, DELETE ON manuales_partes TO authenticated;
GRANT ALL ON manuales_partes TO service_role;

-- ============================================================
-- FIN MIGRACIÓN v54
-- ============================================================
