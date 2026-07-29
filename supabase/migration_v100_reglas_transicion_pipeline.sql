-- v100: Reglas de automatización entre etapas/pipelines (Fase 2)
--
-- Permite definir reglas del tipo: "si un cliente lleva N días en la etapa X,
-- muévelo automáticamente a la etapa Y" (puede ser una etapa de otro pipeline,
-- ej: de "Entregada" en Pipeline Ventas a "1mera Revisión" en Pipeline Post-Venta).
--
-- Usa el historial ya existente (historial_etapas_cliente, de migration_v39) para
-- saber con precisión desde cuándo el cliente está en su etapa actual — no
-- depende de clientes.updated_at porque ese campo se actualiza con cualquier
-- cambio, no solo con el cambio de etapa.

CREATE TABLE IF NOT EXISTS reglas_transicion_pipeline (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL,
  etapa_origen_id   UUID NOT NULL REFERENCES etapas_pipeline(id) ON DELETE CASCADE,
  etapa_destino_id  UUID NOT NULL REFERENCES etapas_pipeline(id) ON DELETE CASCADE,
  dias_en_etapa     INTEGER NOT NULL DEFAULT 1 CHECK (dias_en_etapa >= 0),
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  ultima_corrida_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reglas_transicion_tenant ON reglas_transicion_pipeline(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reglas_transicion_origen ON reglas_transicion_pipeline(etapa_origen_id);

ALTER TABLE reglas_transicion_pipeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_reglas_transicion_all" ON reglas_transicion_pipeline;
CREATE POLICY "tenant_reglas_transicion_all" ON reglas_transicion_pipeline
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reglas_transicion_pipeline TO anon, authenticated, service_role;
