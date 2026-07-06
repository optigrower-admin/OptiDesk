-- migration_v69_motos_colores.sql
-- Tabla de variantes de color con foto y días de entrega para cada moto del catálogo

CREATE TABLE IF NOT EXISTS motos_catalogo_colores (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  moto_catalogo_id uuid NOT NULL REFERENCES motos_catalogo(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre           text NOT NULL DEFAULT '',
  imagen_key       text,
  dias_entrega     integer,
  orden            integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_motos_cat_colores_moto   ON motos_catalogo_colores(moto_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_motos_cat_colores_tenant ON motos_catalogo_colores(tenant_id);

ALTER TABLE motos_catalogo_colores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_colores_rls" ON motos_catalogo_colores
  USING      (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT ALL ON motos_catalogo_colores TO authenticated, service_role;
