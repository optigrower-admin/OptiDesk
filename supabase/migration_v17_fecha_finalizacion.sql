-- Migration v17: Fecha de finalización en órdenes
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS fecha_finalizacion TIMESTAMPTZ;
