-- ============================================================
-- MIGRACIÓN v57 — Nuevo rol "dueno" (view-only, dashboards ejecutivos)
--
-- Dueño es un rol de solo lectura: por defecto en Mi Equipo > Secciones
-- solo verá el grupo "Dashboard" (Servicio Técnico y Repuestos). Gerencia
-- puede habilitarle secciones operativas adicionales desde esa misma
-- pantalla si lo necesita, igual que ya hace con Admin/Profesional.
--
-- Al no tener ninguna política de escritura (INSERT/UPDATE/DELETE) en
-- ninguna tabla, cualquier intento de edición desde la UI quedará
-- bloqueado por RLS aunque el usuario llegue a una pantalla operativa.
-- ============================================================

-- Permitir 'dueno' en usuarios y permisos_roles
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'control_total', 'dueno'));

ALTER TABLE permisos_roles DROP CONSTRAINT IF EXISTS permisos_roles_rol_check;
ALTER TABLE permisos_roles ADD CONSTRAINT permisos_roles_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'dueno'));

-- Dueño necesita leer nombres de todo el equipo de su tenant (top mecánicos,
-- asignación de órdenes), no solo su propia fila — hoy eso solo lo tienen
-- admin/gerencia vía "admin_usuarios_tenant".
CREATE POLICY "dueno_read_usuarios_tenant" ON usuarios
  FOR SELECT USING (get_user_role() = 'dueno' AND tenant_id = get_user_tenant_id());

-- lava_moto_ordenes / lava_moto_config se crearon directo en Supabase Studio
-- (no están en el repo de migraciones) y su RLS exacta es desconocida desde
-- código. Se agrega una política de SOLO LECTURA adicional para 'dueno' —
-- una política permisiva extra nunca resta acceso a las existentes, solo
-- garantiza que Dueño pueda leerlas para el dashboard de Servicio Técnico.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lava_moto_ordenes') THEN
    EXECUTE 'CREATE POLICY "dueno_read_lava_moto_ordenes" ON lava_moto_ordenes
      FOR SELECT USING (get_user_role() = ''dueno'' AND tenant_id = get_user_tenant_id())';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lava_moto_config') THEN
    EXECUTE 'CREATE POLICY "dueno_read_lava_moto_config" ON lava_moto_config
      FOR SELECT USING (get_user_role() = ''dueno'' AND tenant_id = get_user_tenant_id())';
  END IF;
END $$;

-- FIN MIGRACIÓN v57
