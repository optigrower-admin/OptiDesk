-- ──────────────────────────────────────────────────────────────
-- v61: Cotizaciones de venta de motos
-- ──────────────────────────────────────────────────────────────

-- 1. Campos extra en catálogo de motos
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS descripcion      text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS tagline_venta    text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS cilindraje       text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS potencia         text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS frenos           text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS combustible      text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS rendimiento      text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS velocidad_max    text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS garantia         text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS colores          text;
ALTER TABLE motos_catalogo ADD COLUMN IF NOT EXISTS caracteristica   text;

-- 2. Fotos por moto (3 tipos: frente / lado / promocional)
CREATE TABLE IF NOT EXISTS motos_catalogo_fotos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  moto_catalogo_id uuid        NOT NULL REFERENCES motos_catalogo(id) ON DELETE CASCADE,
  tenant_id        uuid        NOT NULL,
  tipo             text        NOT NULL, -- 'frente' | 'lado' | 'promocional'
  r2_key           text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(moto_catalogo_id, tipo)
);
ALTER TABLE motos_catalogo_fotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fotos_catalogo_tenant" ON motos_catalogo_fotos
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

-- 3. Información de contacto del concesionario para cotizaciones
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_tagline   text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_direccion text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_telefono1 text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_telefono2 text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_email     text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_web       text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_whatsapp  text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cotizacion_contador  int DEFAULT 0;

-- 4. Tabla de cotizaciones generadas
CREATE TABLE IF NOT EXISTS cotizaciones (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  cliente_id       uuid        REFERENCES clientes(id) ON DELETE SET NULL,
  numero           int         NOT NULL,
  fecha_generacion date        NOT NULL DEFAULT CURRENT_DATE,
  vigencia_dias    int         NOT NULL DEFAULT 30,
  cliente_nombre   text,
  cliente_celular  text,
  cliente_email    text,
  -- Snapshot de opciones al momento de generar
  -- [{moto_catalogo_id, referencia, tagline_venta, cilindraje, potencia, frenos, combustible,
  --   rendimiento, velocidad_max, garantia, colores, caracteristica,
  --   foto_frente_key, foto_lado_key, foto_promo_key,
  --   precio, costo_documentos, mostrar_precio}]
  opciones         jsonb       NOT NULL DEFAULT '[]',
  notas            text,
  estado           text        NOT NULL DEFAULT 'generada',
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cotizaciones_tenant" ON cotizaciones
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
