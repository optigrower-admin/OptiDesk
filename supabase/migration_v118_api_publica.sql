-- v118: API pública de OptiDesk (Módulo A) — API keys + logs de uso
--
-- Solo gerencia puede crear/ver/revocar keys (enforcement real en las rutas
-- server-side; la política RLS de abajo es una segunda capa). key_hash usa
-- bcrypt (nunca se guarda la key en texto plano) — key_prefix son los
-- primeros caracteres visibles para que el usuario reconozca cuál es cuál
-- en la lista sin poder reconstruir la key completa.

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,
  permisos     JSONB NOT NULL DEFAULT '{}',
  activa       BOOLEAN NOT NULL DEFAULT true,
  ultimo_uso   TIMESTAMPTZ,
  creada_por   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_gerencia_all" ON api_keys
  FOR ALL USING (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;

CREATE TABLE IF NOT EXISTS api_request_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id   UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  metodo       TEXT NOT NULL,
  status_code  INTEGER NOT NULL,
  ip_origen    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_key_fecha ON api_request_logs(api_key_id, created_at DESC);

ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_request_logs_tenant_select" ON api_request_logs
  FOR SELECT USING (
    api_key_id IN (SELECT id FROM api_keys WHERE tenant_id = get_user_tenant_id())
  );

GRANT SELECT ON TABLE public.api_request_logs TO authenticated;
GRANT ALL ON TABLE public.api_request_logs TO service_role;
