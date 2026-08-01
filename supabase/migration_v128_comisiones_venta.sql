-- v128: Comisiones de venta por cilindraje (sección "Comisiones Freelance").
-- Solo gerencia/dueño/control_total pueden editar el valor (se valida en la
-- API route con el service role; RLS solo deja SELECT a cualquier miembro del
-- tenant, para que los freelancers puedan ver cuánto les toca por venta).

CREATE TABLE IF NOT EXISTS comisiones_venta (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cilindrada_min  INTEGER NOT NULL,
  cilindrada_max  INTEGER NOT NULL,
  comision_valor  NUMERIC NOT NULL DEFAULT 0,
  orden           INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_comisiones_venta_tenant ON comisiones_venta(tenant_id, orden);

ALTER TABLE comisiones_venta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comisiones_venta_tenant_select" ON comisiones_venta
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT ON TABLE public.comisiones_venta TO authenticated;
GRANT ALL ON TABLE public.comisiones_venta TO service_role;

-- Semilla: los 3 rangos de cilindraje pedidos, para cada tenant existente.
INSERT INTO comisiones_venta (tenant_id, cilindrada_min, cilindrada_max, comision_valor, orden)
SELECT id, 100, 150, 120000, 1 FROM tenants
UNION ALL
SELECT id, 151, 200, 120000, 2 FROM tenants
UNION ALL
SELECT id, 201, 400, 120000, 3 FROM tenants;
