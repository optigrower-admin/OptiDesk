-- ============================================================
-- OPTIDESK — Migration v3b: Orden de secciones
-- ============================================================
ALTER TABLE permisos_roles ADD COLUMN IF NOT EXISTS orden INT DEFAULT 0;
