-- v147: Inventario de motos, ligado al pipeline de Ventas.
--
-- cantidad_total es lo único que se guarda/edita a mano (en Config Ventas).
-- Comprometidas/Para entregar/Disponibles NO se guardan — se calculan al
-- vuelo cruzando esta tabla con clientes + clientes_motos_interes, para que
-- nunca queden desincronizados con el pipeline real (ver
-- src/lib/ventas/inventario.ts).
CREATE TABLE IF NOT EXISTS inventario_motos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  moto_catalogo_id  UUID NOT NULL REFERENCES motos_catalogo(id) ON DELETE CASCADE,
  cantidad_total    INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_total >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES usuarios(id),
  UNIQUE(tenant_id, moto_catalogo_id)
);

ALTER TABLE inventario_motos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventario_motos_tenant_all" ON inventario_motos;
CREATE POLICY "inventario_motos_tenant_all" ON inventario_motos
  FOR ALL USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventario_motos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventario_motos TO service_role;
