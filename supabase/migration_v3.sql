-- ============================================================
-- OPTIDESK — Migration v3: Rol gerencia
-- ============================================================

-- Actualizar constraint en usuarios
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'superadmin'));

-- Actualizar constraint en permisos_roles
ALTER TABLE permisos_roles DROP CONSTRAINT IF EXISTS permisos_roles_rol_check;
ALTER TABLE permisos_roles ADD CONSTRAINT permisos_roles_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia'));
