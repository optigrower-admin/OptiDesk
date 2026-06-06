-- Migración V15: Logo por empresa
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Crear bucket público para logos (si no existe, ejecutar esto en SQL Editor
-- o crearlo manualmente en Supabase → Storage → New bucket → nombre: "logos" → Public: ON)
-- Este comando crea el bucket vía SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;
