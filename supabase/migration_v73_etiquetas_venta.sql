-- Catálogo de etiquetas por tenant
CREATE TABLE IF NOT EXISTS etiquetas_venta (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  nombre     text NOT NULL,
  color      text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tenant_id, nombre)
);

-- Relación cliente <-> etiqueta (N:M)
CREATE TABLE IF NOT EXISTS clientes_etiquetas (
  cliente_id  uuid REFERENCES clientes(id) ON DELETE CASCADE NOT NULL,
  etiqueta_id uuid REFERENCES etiquetas_venta(id) ON DELETE CASCADE NOT NULL,
  tenant_id   uuid NOT NULL,
  PRIMARY KEY (cliente_id, etiqueta_id)
);

-- RLS etiquetas_venta
ALTER TABLE etiquetas_venta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_etiquetas" ON etiquetas_venta;
DROP POLICY IF EXISTS "tenant_etiquetas_all" ON etiquetas_venta;
CREATE POLICY "tenant_etiquetas_all" ON etiquetas_venta
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

-- RLS clientes_etiquetas
ALTER TABLE clientes_etiquetas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_clientes_etiquetas" ON clientes_etiquetas;
DROP POLICY IF EXISTS "tenant_clientes_etiquetas_all" ON clientes_etiquetas;
CREATE POLICY "tenant_clientes_etiquetas_all" ON clientes_etiquetas
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

-- Grants explícitos (necesarios cuando la tabla se crea por SQL, no por el dashboard)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.etiquetas_venta    TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clientes_etiquetas TO anon, authenticated, service_role;
