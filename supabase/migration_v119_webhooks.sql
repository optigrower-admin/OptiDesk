-- v119: Webhooks salientes de OptiDesk (Módulo B)

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url_destino  TEXT NOT NULL,
  eventos      JSONB NOT NULL DEFAULT '[]',
  secreto      TEXT NOT NULL,
  activo       BOOLEAN NOT NULL DEFAULT true,
  creado_por   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant ON webhook_subscriptions(tenant_id);

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_subscriptions_gerencia_all" ON webhook_subscriptions
  FOR ALL USING (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhook_subscriptions TO authenticated;
GRANT ALL ON TABLE public.webhook_subscriptions TO service_role;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_subscription_id  UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  evento                   TEXT NOT NULL,
  payload                  JSONB NOT NULL,
  status_code_respuesta    INTEGER,
  intento_numero           INTEGER NOT NULL DEFAULT 1,
  exitoso                  BOOLEAN NOT NULL DEFAULT false,
  proxima_reintento_at     TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_sub_fecha ON webhook_deliveries(webhook_subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pendientes ON webhook_deliveries(proxima_reintento_at) WHERE exitoso = false;

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_deliveries_tenant_select" ON webhook_deliveries
  FOR SELECT USING (
    webhook_subscription_id IN (SELECT id FROM webhook_subscriptions WHERE tenant_id = get_user_tenant_id())
  );

GRANT SELECT ON TABLE public.webhook_deliveries TO authenticated;
GRANT ALL ON TABLE public.webhook_deliveries TO service_role;

-- Solo estructura por ahora (sin lógica de proveedores específicos todavía)
CREATE TABLE IF NOT EXISTS webhooks_entrantes_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proveedor         TEXT NOT NULL,
  endpoint_secreto  TEXT,
  activo            BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, proveedor)
);

ALTER TABLE webhooks_entrantes_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhooks_entrantes_config_gerencia_all" ON webhooks_entrantes_config
  FOR ALL USING (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.webhooks_entrantes_config TO authenticated;
GRANT ALL ON TABLE public.webhooks_entrantes_config TO service_role;
