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
CREATE POLICY "tenant_etiquetas" ON etiquetas_venta
  USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

-- RLS clientes_etiquetas
ALTER TABLE clientes_etiquetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_clientes_etiquetas" ON clientes_etiquetas
  USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
