-- migration_v8.sql
-- 1. Tabla proveedores
-- 2. Extiende repuestos_externos con proveedor_id, subgrupo, unidad_empaque
-- Ejecutar en Supabase SQL Editor

-- ── Tabla proveedores ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS proveedores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  telefono    TEXT,
  ubicacion   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_proveedores_tenant ON proveedores(tenant_id);

ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_proveedores" ON proveedores
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );
CREATE POLICY "admin_crud_proveedores" ON proveedores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid()
        AND rol IN ('control_total','gerencia','admin','mecanico')
        AND tenant_id = proveedores.tenant_id
    )
  );

-- Trigger updated_at proveedores
CREATE OR REPLACE FUNCTION fn_set_updated_at_proveedores()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_proveedores_updated_at ON proveedores;
CREATE TRIGGER trg_proveedores_updated_at
  BEFORE UPDATE ON proveedores FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at_proveedores();

-- ── Extender repuestos_externos ────────────────────────────
ALTER TABLE repuestos_externos
  ADD COLUMN IF NOT EXISTS proveedor_id   UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subgrupo       TEXT,
  ADD COLUMN IF NOT EXISTS unidad_empaque INT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_repuestos_ext_proveedor ON repuestos_externos(proveedor_id);
