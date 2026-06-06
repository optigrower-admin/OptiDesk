-- migration_v11.sql
-- Números de orden UMA por orden de servicio
-- Ejecutar en Supabase SQL Editor

ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS numeros_orden_uma TEXT[] DEFAULT '{}';

-- Índice GIN para búsqueda eficiente dentro del array
CREATE INDEX IF NOT EXISTS idx_ordenes_numeros_uma
  ON ordenes USING GIN (numeros_orden_uma);
