-- v98: Notas internas y campos personalizados por cliente (panel de contacto en Bandeja)

CREATE TABLE IF NOT EXISTS notas_cliente (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  autor_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  contenido   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notas_cliente_cliente ON notas_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_notas_cliente_tenant  ON notas_cliente(tenant_id);

ALTER TABLE notas_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_notas_cliente_all" ON notas_cliente;
CREATE POLICY "tenant_notas_cliente_all" ON notas_cliente
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notas_cliente TO anon, authenticated, service_role;


CREATE TABLE IF NOT EXISTS cliente_campos_custom (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clave       TEXT NOT NULL,
  valor       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliente_campos_custom_cliente ON cliente_campos_custom(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cliente_campos_custom_tenant  ON cliente_campos_custom(tenant_id);

ALTER TABLE cliente_campos_custom ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_cliente_campos_custom_all" ON cliente_campos_custom;
CREATE POLICY "tenant_cliente_campos_custom_all" ON cliente_campos_custom
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cliente_campos_custom TO anon, authenticated, service_role;
