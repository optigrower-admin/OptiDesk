-- v139: Medidas y Variables calculadas para el constructor de dashboard
-- (base del futuro constructor de gráficas estilo Power BI).

CREATE TABLE IF NOT EXISTS dashboard_medidas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  tabla        TEXT NOT NULL,
  campo        TEXT,
  agregacion   TEXT NOT NULL CHECK (agregacion IN ('suma', 'promedio', 'conteo', 'conteo_distinto', 'minimo', 'maximo')),
  campo_fecha  TEXT,
  filtros      JSONB NOT NULL DEFAULT '[]',
  formato      TEXT NOT NULL DEFAULT 'moneda' CHECK (formato IN ('moneda', 'entero', 'decimal', 'porcentaje')),
  decimales    INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nombre)
);

CREATE TABLE IF NOT EXISTS dashboard_variables (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  formula      TEXT NOT NULL,
  formato      TEXT NOT NULL DEFAULT 'moneda' CHECK (formato IN ('moneda', 'entero', 'decimal', 'porcentaje')),
  decimales    INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nombre)
);

ALTER TABLE dashboard_medidas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dashboard_medidas_tenant_all" ON dashboard_medidas
  FOR ALL USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

CREATE POLICY "dashboard_variables_tenant_all" ON dashboard_variables
  FOR ALL USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_medidas   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_medidas   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_variables TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_variables TO service_role;
