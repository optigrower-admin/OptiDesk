-- migration_v10.sql
-- Campo de notas internas en la orden
-- Ejecutar en Supabase SQL Editor

ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS notas TEXT;
