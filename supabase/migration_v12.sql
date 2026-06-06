-- migration_v12.sql
-- Grants faltantes en tablas creadas después del schema inicial
-- Ejecutar en Supabase SQL Editor

GRANT SELECT, INSERT, UPDATE, DELETE ON proveedores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON repuestos_externos TO authenticated;
