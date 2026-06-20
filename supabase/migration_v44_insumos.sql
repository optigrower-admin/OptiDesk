-- ============================================================
-- MIGRACIÓN v44 — Insumos en repuestos de Servicio Técnico
-- Ejecutar DESPUÉS de migration_v43_caja.sql
--
-- Nuevo origen 'insumo' en items_orden: un valor rápido (sin
-- proveedor, sin costo) que se agrega a la orden y que en Caja
-- cuenta solo como ingreso (no genera gasto, porque no tiene
-- repuesto_externo_id ni costo asociado).
-- ============================================================

ALTER TABLE items_orden DROP CONSTRAINT IF EXISTS items_orden_origen_check;
ALTER TABLE items_orden ADD CONSTRAINT items_orden_origen_check
  CHECK (origen IN ('uma', 'externo', 'mano_obra', 'insumo'));

-- ============================================================
-- FIN MIGRACIÓN v44
-- ============================================================
