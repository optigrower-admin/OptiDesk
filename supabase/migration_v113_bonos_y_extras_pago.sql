-- v113: Bonos configurables + plazo estimado + bono por estudio de crédito
--
-- 1. Catálogo de "Bonos" (tenant-configurable desde Config Ventas → Bonos),
--    ej: Financiera, UMA, Motospace38. Predeterminado = sin bono (ninguno
--    seleccionado), y se puede aplicar 1 o varios bonos por cliente, cada
--    uno con su propio valor (descuento al valor de la moto).
CREATE TABLE IF NOT EXISTS bonos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  activa     BOOLEAN NOT NULL DEFAULT true,
  orden      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bonos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bonos_tenant_all" ON bonos
  FOR ALL USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bonos TO authenticated;
GRANT SELECT ON TABLE public.bonos TO anon;

-- 2. Bonos aplicados a un cliente puntual, con su valor.
CREATE TABLE IF NOT EXISTS clientes_bonos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  bono_id    UUID NOT NULL REFERENCES bonos(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  monto      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, bono_id)
);

ALTER TABLE clientes_bonos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_bonos_tenant_all" ON clientes_bonos
  FOR ALL USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clientes_bonos TO authenticated;

-- 3. Plazo estimado en meses (junto a la cuota mensual estimada de crédito).
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS plazo_meses INTEGER;

-- 4. Bono (sí/no) dentro del estudio de crédito por entidad.
ALTER TABLE clientes_credito_estudio ADD COLUMN IF NOT EXISTS bono BOOLEAN NOT NULL DEFAULT false;

-- 5. El frontend ya usa 'credito_ci' como forma de pago (Crédito & C. Inicial)
--    pero el constraint original solo permitía 'contado'/'credito'. Se amplía.
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_forma_pago_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_forma_pago_check
  CHECK (forma_pago IS NULL OR forma_pago IN ('contado', 'credito', 'credito_ci'));
