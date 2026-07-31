-- v120: Integraciones IA (Módulo C) — OpenAI, Anthropic, Google, Grok, ElevenLabs
--
-- Independiente de config_apis_ia/agentes_ia (usadas hoy solo por el motor de
-- Flujos para el nodo "agente_ia" existente). integraciones_ia es la capa
-- nueva, más general, que alimenta llamarIA() — reutilizable tanto por
-- features fijas de OptiDesk como por el nuevo nodo "Acción IA" de Flujos.
-- La API key se cifra con el mismo esquema AES-256-CBC de src/lib/crypto.ts
-- que ya se usa para los tokens de Meta y las keys de config_apis_ia.

CREATE TABLE IF NOT EXISTS integraciones_ia (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proveedor          TEXT NOT NULL CHECK (proveedor IN ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'GROK', 'ELEVENLABS')),
  api_key_encrypted  TEXT NOT NULL,
  modelo_default     TEXT,
  activo             BOOLEAN NOT NULL DEFAULT true,
  uso_asignado       JSONB NOT NULL DEFAULT '[]',
  creada_por         UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, proveedor)
);

ALTER TABLE integraciones_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integraciones_ia_gerencia_all" ON integraciones_ia
  FOR ALL USING (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.integraciones_ia TO authenticated;
GRANT ALL ON TABLE public.integraciones_ia TO service_role;

CREATE TABLE IF NOT EXISTS ia_usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proveedor       TEXT NOT NULL,
  uso             TEXT NOT NULL,
  tokens_entrada  INTEGER,
  tokens_salida   INTEGER,
  costo_estimado  NUMERIC(10,4),
  duracion_ms     INTEGER,
  exitoso         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_usage_logs_tenant_fecha ON ia_usage_logs(tenant_id, created_at DESC);

ALTER TABLE ia_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ia_usage_logs_tenant_select" ON ia_usage_logs
  FOR SELECT USING (tenant_id = get_user_tenant_id());

GRANT SELECT ON TABLE public.ia_usage_logs TO authenticated;
GRANT ALL ON TABLE public.ia_usage_logs TO service_role;
