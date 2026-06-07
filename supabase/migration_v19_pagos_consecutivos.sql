-- Migration v19: Tabla de pagos consecutivos por orden
-- Ejecutar en Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS pagos_orden (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id      UUID NOT NULL REFERENCES ordenes(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  monto         NUMERIC(12,2) NOT NULL,
  metodo_pago_id UUID REFERENCES metodos_pago(id),
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notas         TEXT,
  registrado_por UUID REFERENCES usuarios(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsqueda por orden
CREATE INDEX IF NOT EXISTS idx_pagos_orden_orden_id ON pagos_orden(orden_id);
CREATE INDEX IF NOT EXISTS idx_pagos_orden_tenant_id ON pagos_orden(tenant_id);

-- RLS
ALTER TABLE pagos_orden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_access_pagos_orden" ON pagos_orden
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
    OR (SELECT rol FROM usuarios WHERE id = auth.uid()) = 'control_total'
  );
