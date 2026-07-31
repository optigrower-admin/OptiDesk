-- v121: Historial de pasos por ejecución de Flujo
--
-- flujo_ejecuciones solo guarda el estado actual (nodo_actual_id,
-- pasos_ejecutados, ultimo_error) — no queda registro de por dónde pasó ni
-- qué falló en cada nodo. Esta tabla registra un renglón por cada nodo
-- procesado (éxito, advertencia interna, error, pausa o fin), para poder
-- ver el camino completo y el motivo exacto de cualquier falla.

CREATE TABLE IF NOT EXISTS flujo_ejecucion_pasos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecucion_id  UUID NOT NULL REFERENCES flujo_ejecuciones(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nodo_id       TEXT NOT NULL,
  nodo_tipo     TEXT,
  resultado     TEXT NOT NULL CHECK (resultado IN ('ok', 'advertencia', 'error', 'pausar', 'fin')),
  detalle       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flujo_ejecucion_pasos_ejecucion ON flujo_ejecucion_pasos(ejecucion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_flujo_ejecucion_pasos_tenant ON flujo_ejecucion_pasos(tenant_id, created_at DESC);

ALTER TABLE flujo_ejecucion_pasos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flujo_ejecucion_pasos_tenant_select" ON flujo_ejecucion_pasos
  FOR SELECT USING (tenant_id = get_user_tenant_id());

GRANT SELECT ON TABLE public.flujo_ejecucion_pasos TO authenticated;
GRANT ALL ON TABLE public.flujo_ejecucion_pasos TO service_role;
