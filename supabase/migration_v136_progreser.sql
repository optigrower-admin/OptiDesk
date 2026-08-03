-- v136: Credenciales de Progreser (plataforma de estudio de crédito) por
-- tenant, cifradas igual que el resto de tokens sensibles del sistema.
-- Se guardan a nivel de tenant (un solo login de empresa, no por usuario).

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS progreser_usuario TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS progreser_password_enc TEXT;

-- Registro de cada intento de envío a Progreser, para poder ver el
-- historial y diagnosticar cuando el sitio de Progreser cambie y rompa
-- la automatización.
CREATE TABLE IF NOT EXISTS progreser_envios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  usuario_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  exitoso      BOOLEAN NOT NULL DEFAULT FALSE,
  mensaje      TEXT,
  screenshot_key TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_progreser_envios_cliente ON progreser_envios(cliente_id, created_at DESC);
ALTER TABLE progreser_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "progreser_envios_tenant_select" ON progreser_envios;
CREATE POLICY "progreser_envios_tenant_select" ON progreser_envios
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
GRANT SELECT ON TABLE public.progreser_envios TO authenticated;
GRANT ALL ON TABLE public.progreser_envios TO service_role;
