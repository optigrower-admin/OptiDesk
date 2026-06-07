-- Migration v20: Medios y notas por perfil de usuario
-- Ejecutar en Supabase → SQL Editor

-- Tabla: fotos/videos por perfil
CREATE TABLE IF NOT EXISTS medios_perfil (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('imagen', 'video')),
  nombre_archivo  TEXT,
  storage_location TEXT NOT NULL DEFAULT 'r2',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medios_perfil_usuario ON medios_perfil(usuario_id);
CREATE INDEX IF NOT EXISTS idx_medios_perfil_tenant ON medios_perfil(tenant_id);

ALTER TABLE medios_perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_medios_perfil" ON medios_perfil
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
    OR (SELECT rol FROM usuarios WHERE id = auth.uid()) = 'control_total'
  );

-- Tabla: notas internas por perfil de usuario
CREATE TABLE IF NOT EXISTS notas_perfil (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  autor_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contenido   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notas_perfil_perfil ON notas_perfil(perfil_id);
CREATE INDEX IF NOT EXISTS idx_notas_perfil_tenant ON notas_perfil(tenant_id);

ALTER TABLE notas_perfil ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_notas_perfil" ON notas_perfil
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
    OR (SELECT rol FROM usuarios WHERE id = auth.uid()) = 'control_total'
  );
