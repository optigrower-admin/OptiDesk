-- v33: Entorno de prueba (sandbox) por empresa
-- Cada tenant de producción puede tener un tenant sandbox vinculado.
-- Usuarios con sandbox_tenant_id configurado usan esos datos en el entorno staging.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS es_sandbox BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source_tenant_id UUID REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS sandbox_tenant_id UUID REFERENCES tenants(id);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS sandbox_tenant_id UUID REFERENCES tenants(id);

-- Índice para búsquedas de sandbox por source
CREATE INDEX IF NOT EXISTS idx_tenants_source_tenant_id ON tenants(source_tenant_id);
