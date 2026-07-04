-- v67: Cotizaciones de Servicio Técnico & Repuestos

CREATE TABLE IF NOT EXISTS cotizaciones_servtec (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero           integer     NOT NULL,
  fecha_generacion date        NOT NULL DEFAULT CURRENT_DATE,
  vigencia_dias    integer     NOT NULL DEFAULT 30,
  cliente_id       uuid        REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre   text,
  cliente_celular  text,
  cliente_email    text,
  notas            text,
  estado           text        NOT NULL DEFAULT 'generada',
  created_by       uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, numero)
);

ALTER TABLE cotizaciones_servtec ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cot_st_tenant" ON cotizaciones_servtec
  USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS cotizaciones_servtec_items (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  cotizacion_id    uuid        NOT NULL REFERENCES cotizaciones_servtec(id) ON DELETE CASCADE,
  tipo             text        NOT NULL,  -- 'repuesto_uma' | 'repuesto_externo' | 'mano_obra'
  uma_id           uuid        REFERENCES repuestos_uma(id) ON DELETE SET NULL,
  referencia       text,
  descripcion      text        NOT NULL,
  cantidad         integer     NOT NULL DEFAULT 1,
  precio_proveedor numeric,               -- costo proveedor (para repuestos)
  precio_venta     numeric     NOT NULL,  -- precio venta al cliente con IVA
  orden            integer     NOT NULL DEFAULT 0
);

ALTER TABLE cotizaciones_servtec_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cot_st_items_tenant" ON cotizaciones_servtec_items
  USING (cotizacion_id IN (
    SELECT id FROM cotizaciones_servtec
    WHERE tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  ));

CREATE INDEX IF NOT EXISTS idx_cot_st_tenant  ON cotizaciones_servtec(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cot_st_items   ON cotizaciones_servtec_items(cotizacion_id);
