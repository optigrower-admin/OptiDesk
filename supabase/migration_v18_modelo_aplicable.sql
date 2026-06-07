-- Migration v18: Columna modelo_aplicable en catálogos de repuestos
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE repuestos_uma
  ADD COLUMN IF NOT EXISTS modelo_aplicable TEXT;

ALTER TABLE repuestos_externos
  ADD COLUMN IF NOT EXISTS modelo_aplicable TEXT;

-- Índice para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_repuestos_uma_modelo ON repuestos_uma (modelo_aplicable);
CREATE INDEX IF NOT EXISTS idx_repuestos_ext_modelo ON repuestos_externos (modelo_aplicable);
