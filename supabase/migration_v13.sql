-- migration_v13.sql
-- Agrega columna para almacenar el refresh token OAuth de Google Drive por tenant
-- Ejecutar en Supabase SQL Editor

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
