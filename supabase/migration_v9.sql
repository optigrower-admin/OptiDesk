-- migration_v9.sql
-- Estado de seguimiento de repuesto dentro de la orden
-- Ejecutar en Supabase SQL Editor

ALTER TABLE items_orden
  ADD COLUMN IF NOT EXISTS estado_repuesto TEXT DEFAULT NULL
  CHECK (estado_repuesto IN ('pedido', 'ok'));
