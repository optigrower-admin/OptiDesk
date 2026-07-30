-- v111: Cierres diarios de Caja
--
-- Todos los días a las 11:59pm (hora Colombia) se guarda una "foto" del
-- saldo de cada cuenta (Nequi, Efectivo, etc — lo que exista en metodos_pago
-- de cada tenant) y de Caja Fuerte, para poder consultar el histórico de
-- cierres por fecha desde el botón "Registro Cierres Diario" en Caja.

CREATE TABLE IF NOT EXISTS cierres_diarios_caja (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fecha             DATE NOT NULL, -- fecha local (America/Bogota) del cierre
  saldos_por_cuenta JSONB NOT NULL DEFAULT '[]', -- [{ metodo_pago_id, nombre, saldo }]
  saldo_caja_fuerte NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_cierres_diarios_caja_tenant_fecha ON cierres_diarios_caja(tenant_id, fecha DESC);

ALTER TABLE cierres_diarios_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select_cierres_diarios_caja" ON cierres_diarios_caja
  FOR SELECT USING (tenant_id = get_user_tenant_id());

GRANT SELECT ON TABLE public.cierres_diarios_caja TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cierres_diarios_caja TO service_role;
