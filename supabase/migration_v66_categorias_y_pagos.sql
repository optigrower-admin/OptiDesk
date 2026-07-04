-- v66: Categorías de pago configurables + registro de pagos por cliente

-- Categorías de pago (configurables por tenant)
CREATE TABLE IF NOT EXISTS categorias_pago (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      text        NOT NULL,
  orden       integer     NOT NULL DEFAULT 0,
  activa      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE categorias_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categorias_pago_tenant_select" ON categorias_pago
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "categorias_pago_tenant_all" ON categorias_pago
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

-- Índice para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_categorias_pago_tenant ON categorias_pago(tenant_id, activa);

-- Pagos registrados por cliente
CREATE TABLE IF NOT EXISTS clientes_pagos (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id      uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria_id    uuid        REFERENCES categorias_pago(id) ON DELETE SET NULL,
  codigo_factura  text,
  monto           numeric     NOT NULL DEFAULT 0,
  metodo_pago     text,
  notas           text,
  created_by      uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clientes_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_pagos_tenant_select" ON clientes_pagos
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "clientes_pagos_tenant_all" ON clientes_pagos
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_clientes_pagos_cliente ON clientes_pagos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_clientes_pagos_tenant  ON clientes_pagos(tenant_id);
