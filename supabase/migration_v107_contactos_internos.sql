-- v107: Contactos Internos — directorio interno de la empresa (gerencia/dueño)
--
-- Sección nueva, hermana de "Credenciales", para guardar contactos de uso
-- interno (proveedores, soporte, aliados, etc.) con uno o más celulares,
-- correos y links por contacto.

CREATE TABLE IF NOT EXISTS contactos_internos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  categoria   TEXT NOT NULL DEFAULT 'General',
  celulares   TEXT[] NOT NULL DEFAULT '{}',
  correos     TEXT[] NOT NULL DEFAULT '{}',
  links       TEXT[] NOT NULL DEFAULT '{}',
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contactos_internos_tenant ON contactos_internos(tenant_id);

ALTER TABLE contactos_internos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_contactos_internos_all" ON contactos_internos;
CREATE POLICY "tenant_contactos_internos_all" ON contactos_internos
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contactos_internos TO anon, authenticated, service_role;
