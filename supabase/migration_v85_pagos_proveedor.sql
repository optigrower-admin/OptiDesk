-- ============================================================
-- V85: Pagos a proveedor por orden de servicio
-- Registra los abonos de costo de repuestos/insumos terceros
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pagos_proveedor (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id        UUID        NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  notas           TEXT,
  metodo_pago_id  UUID        REFERENCES public.metodos_pago(id) ON DELETE SET NULL,
  registrado_por  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_proveedor_orden    ON public.pagos_proveedor(orden_id);
CREATE INDEX IF NOT EXISTS idx_pagos_proveedor_tenant   ON public.pagos_proveedor(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pagos_proveedor_fecha    ON public.pagos_proveedor(tenant_id, fecha);

ALTER TABLE public.pagos_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_pagos_proveedor"
  ON public.pagos_proveedor FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

GRANT ALL ON TABLE public.pagos_proveedor TO postgres, anon, authenticated, service_role;
