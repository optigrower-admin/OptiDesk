-- ============================================================
-- OptiDesk V1 — Migración de rendimiento: Índices nuevos
-- Solo agrega índices que NO existen en schema.sql ni migration_v2.sql
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- Índice compuesto (tenant + estado) para el listado de órdenes filtrado
CREATE INDEX IF NOT EXISTS idx_ordenes_tenant_estado
  ON ordenes (tenant_id, estado);

-- Índice compuesto (tenant + fecha) para paginación por taller
CREATE INDEX IF NOT EXISTS idx_ordenes_tenant_created
  ON ordenes (tenant_id, created_at DESC);

-- Búsqueda por número de orden dentro de un taller
CREATE INDEX IF NOT EXISTS idx_ordenes_numero
  ON ordenes (tenant_id, numero DESC);

-- Índice compuesto (tenant + storage_location) para saber cuánto hay en R2 vs Drive
CREATE INDEX IF NOT EXISTS idx_medios_tenant_location
  ON medios (tenant_id, storage_location);

-- Índice parcial: medios en R2 ordenados por fecha (usado en archivado automático)
CREATE INDEX IF NOT EXISTS idx_medios_tenant_r2_created
  ON medios (tenant_id, created_at ASC)
  WHERE storage_location = 'r2';

-- Inventario externo por taller
CREATE INDEX IF NOT EXISTS idx_repuestos_ext_tenant
  ON repuestos_externos (tenant_id);

-- Búsqueda de moto por placa normalizada
CREATE INDEX IF NOT EXISTS idx_motos_placa
  ON motos (tenant_id, upper(placa));

-- Filtrar usuarios por rol dentro de un taller
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_rol
  ON usuarios (tenant_id, rol);

-- Estadísticas actualizadas para que el planner use los índices nuevos
ANALYZE ordenes;
ANALYZE medios;
ANALYZE repuestos_externos;
ANALYZE motos;
ANALYZE usuarios;
