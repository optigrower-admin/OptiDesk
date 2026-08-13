-- v160: Ocultar una columna (etapa) del pipeline por rol, configurable desde
-- Config Ventas → Pipelines, igual que ya existía para ocultar un pipeline
-- completo (roles_ocultos en pipelines_venta, migration_v106).

ALTER TABLE etapas_pipeline ADD COLUMN IF NOT EXISTS roles_ocultos TEXT[] NOT NULL DEFAULT '{}';

-- ─── Fix: roles restringidos no podían leer el nombre de otros compañeros ──
-- Solo existían políticas de lectura completa del tenant para admin/gerencia/
-- dueño; cualquier otro rol (mecánico, freelancer, asesor_comercial) caía en
-- "mecanico_read_own" (solo su propia fila), así que cualquier JOIN a
-- usuarios(nombre) para mostrar el autor de un comentario, asignado, etc.
-- devolvía null y la UI mostraba "Usuario" genérico. Se agrega una política
-- de SOLO LECTURA para cualquier miembro del tenant (no toca los permisos de
-- escritura, que siguen restringidos a admin/gerencia/dueño).

DROP POLICY IF EXISTS "tenant_read_usuarios" ON usuarios;
CREATE POLICY "tenant_read_usuarios" ON usuarios
  FOR SELECT USING (tenant_id = get_user_tenant_id());
