-- v137: Créditos/desembolsos por cliente (uno o más, con entidad, crédito
-- aprobado para el cliente, desembolso real y plazo) — reemplaza el campo
-- suelto "monto aprobado" que vivía dentro de cada tarjeta de entidad en
-- Estudio de crédito. El Desembolso es lo que se descuenta del saldo junto
-- con el precio de la moto y los pagos registrados.
CREATE TABLE IF NOT EXISTS clientes_creditos_desembolso (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidad_id       UUID REFERENCES entidades_financieras(id) ON DELETE SET NULL,
  credito_cliente  NUMERIC(12,2),
  desembolso       NUMERIC(12,2),
  plazo_meses      INTEGER,
  desembolsado     BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clientes_creditos_desembolso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creditos_desembolso_tenant_all" ON clientes_creditos_desembolso
  FOR ALL USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clientes_creditos_desembolso TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clientes_creditos_desembolso TO service_role;
