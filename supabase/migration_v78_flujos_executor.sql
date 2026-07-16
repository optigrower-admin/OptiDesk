-- ══════════════════════════════════════════════════════════════════════════════
-- Migration v78: Flow Executor Engine + AI Agents + API Keys
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. flujo_ejecuciones: tracks running flow instances per conversation ──────
CREATE TABLE IF NOT EXISTS flujo_ejecuciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  flujo_id             uuid REFERENCES flujos_automatizacion(id) ON DELETE CASCADE,
  conversacion_id      uuid,
  cliente_id           uuid,
  estado               text NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo','pausado','completado','error','cancelado')),
  nodo_actual_id       text,
  contexto             jsonb DEFAULT '{}',
  proxima_ejecucion_at timestamptz,
  ultimo_error         text,
  pasos_ejecutados     int DEFAULT 0,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- ── 2. agentes_ia: AI agents configurable per tenant ─────────────────────────
CREATE TABLE IF NOT EXISTS agentes_ia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  nombre          text NOT NULL,
  proveedor       text NOT NULL CHECK (proveedor IN ('openai', 'anthropic', 'elevenlabs')),
  modelo          text,
  prompt_sistema  text,
  instrucciones   text,
  temperatura     numeric DEFAULT 0.7,
  max_tokens      int DEFAULT 800,
  activo          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── 3. config_apis_ia: encrypted API keys per tenant ─────────────────────────
CREATE TABLE IF NOT EXISTS config_apis_ia (
  tenant_id                   uuid PRIMARY KEY,
  openai_key_enc              text,
  anthropic_key_enc           text,
  elevenlabs_key_enc          text,
  openai_modelo_default       text DEFAULT 'gpt-4o-mini',
  anthropic_modelo_default    text DEFAULT 'claude-haiku-4-5-20251001',
  elevenlabs_voz_id           text,
  updated_at                  timestamptz DEFAULT now()
);

-- ── 4. Add automation tracking fields to clientes ─────────────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS automatizado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flujo_activo_id uuid;

-- ── 4b. Add media_url to mensajes for storing media attachments ───────────────
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS media_url text;

-- ── 5. Row-Level Security ─────────────────────────────────────────────────────
ALTER TABLE flujo_ejecuciones ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'flujo_ejecuciones' AND policyname = 'tenant_iso_ejecuciones'
  ) THEN
    CREATE POLICY "tenant_iso_ejecuciones" ON flujo_ejecuciones
      USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

ALTER TABLE agentes_ia ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agentes_ia' AND policyname = 'tenant_iso_agentes'
  ) THEN
    CREATE POLICY "tenant_iso_agentes" ON agentes_ia
      USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

ALTER TABLE config_apis_ia ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'config_apis_ia' AND policyname = 'tenant_iso_apis_ia'
  ) THEN
    CREATE POLICY "tenant_iso_apis_ia" ON config_apis_ia
      USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

-- ── 6. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_flujo_ejecuciones_tenant_estado
  ON flujo_ejecuciones(tenant_id, estado);

CREATE INDEX IF NOT EXISTS idx_flujo_ejecuciones_proxima
  ON flujo_ejecuciones(proxima_ejecucion_at) WHERE estado = 'activo';

CREATE INDEX IF NOT EXISTS idx_flujo_ejecuciones_conversacion
  ON flujo_ejecuciones(conversacion_id) WHERE estado = 'activo';

CREATE INDEX IF NOT EXISTS idx_agentes_ia_tenant
  ON agentes_ia(tenant_id, activo);
