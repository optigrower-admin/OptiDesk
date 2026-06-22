-- ============================================================
-- MIGRACIÓN v53 — Manuales de Partes (catálogo subible por CSV)
--
-- El botón "Ver Manuales de Partes" de Servicio Técnico dejó de apuntar
-- a un notebook fijo de NotebookLM: ahora muestra un buscador con los
-- PDFs de catálogo de repuestos (Motocarros / Motocicletas), cada uno
-- con su link directo de Google Drive. Cada tenant puede tener un
-- catálogo de marcas distinto, así que la tabla queda por tenant y se
-- actualiza subiendo un CSV desde Config Servicio Técnico (columnas
-- MANUAL, CARPETA, LINK DRIVE) en vez de quedar fijo en el código.
-- ============================================================

CREATE TABLE IF NOT EXISTS manuales_partes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  carpeta     TEXT NOT NULL CHECK (carpeta IN ('Motocarros', 'Motocicletas')),
  link        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manuales_partes_tenant ON manuales_partes(tenant_id);

ALTER TABLE manuales_partes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "control_total_all_manuales" ON manuales_partes
  FOR ALL USING (get_user_role() = 'control_total');

CREATE POLICY "tenant_read_manuales" ON manuales_partes
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "admin_crud_manuales" ON manuales_partes
  FOR ALL USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id());

-- ============================================================
-- FIN MIGRACIÓN v53
-- ============================================================
