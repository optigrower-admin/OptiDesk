-- ============================================================
-- V84: Drive para Ventas Archivos y Documentos Internos
-- - Nuevas columnas Drive en tenants y clientes
-- - Nueva tabla documentos_internos
-- ============================================================

-- 1. Columnas Drive en tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS ventas_drive_folder_id   TEXT,
  ADD COLUMN IF NOT EXISTS documentos_folder_id      TEXT;

-- 2. Columna drive_folder_id en clientes (subcarpeta por cliente en Ventas)
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

-- 3. Tabla documentos_internos
CREATE TABLE IF NOT EXISTS public.documentos_internos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre              TEXT        NOT NULL,
  storage_location    TEXT        NOT NULL DEFAULT 'supabase' CHECK (storage_location IN ('supabase', 'drive')),
  storage_path        TEXT,
  drive_file_id       TEXT,
  drive_url           TEXT,
  mime_type           TEXT,
  file_size           BIGINT,
  categoria           TEXT        NOT NULL DEFAULT 'General',
  fecha_emision       DATE,
  fecha_vencimiento   DATE,
  anotaciones         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.documentos_internos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_documentos_internos"
  ON public.documentos_internos FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

GRANT ALL ON TABLE public.documentos_internos TO postgres, anon, authenticated, service_role;
