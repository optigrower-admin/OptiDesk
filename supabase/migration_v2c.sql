-- ============================================================
-- OPTIDESK — Migration v2c: Permiso sección inventario
-- Ejecutar DESPUÉS de migration_v2.sql y migration_v2b.sql
-- ============================================================

-- Agrega la sección 'inventario' para rol admin en todos los tenants existentes
-- (solo si no existe ya)
INSERT INTO permisos_roles (tenant_id, rol, seccion, habilitado)
SELECT id, 'admin', 'inventario', true
FROM tenants
WHERE id NOT IN (
  SELECT tenant_id FROM permisos_roles
  WHERE seccion = 'inventario' AND rol = 'admin'
);

-- También agrega 'clientes' y 'motos' si no existen (de migration_v2)
INSERT INTO permisos_roles (tenant_id, rol, seccion, habilitado)
SELECT id, 'admin', 'clientes', true
FROM tenants
WHERE id NOT IN (
  SELECT tenant_id FROM permisos_roles
  WHERE seccion = 'clientes' AND rol = 'admin'
);

INSERT INTO permisos_roles (tenant_id, rol, seccion, habilitado)
SELECT id, 'admin', 'motos', true
FROM tenants
WHERE id NOT IN (
  SELECT tenant_id FROM permisos_roles
  WHERE seccion = 'motos' AND rol = 'admin'
);
