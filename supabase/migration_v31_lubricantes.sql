-- Migration v31: Catálogo de Lubricantes
-- Se agrega como un "tipo" dentro de repuestos_uma (en vez de tabla nueva) para
-- reutilizar tal cual el control de stock (ajustar_stock_uma), los movimientos
-- de inventario y el FK repuesto_uma_id en items_orden — un lubricante se
-- vende/descuenta exactamente igual que un repuesto UMA.
-- Ejecutar en Supabase → SQL Editor

ALTER TABLE repuestos_uma
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'repuesto'
  CHECK (tipo IN ('repuesto', 'lubricante'));

CREATE INDEX IF NOT EXISTS idx_repuestos_uma_tipo ON repuestos_uma(tenant_id, tipo);

-- La unicidad de código pasa a ser por tipo, para que un repuesto y un
-- lubricante nunca choquen entre sí aunque coincida el texto de referencia.
ALTER TABLE repuestos_uma DROP CONSTRAINT IF EXISTS repuestos_uma_tenant_id_codigo_key;
ALTER TABLE repuestos_uma ADD CONSTRAINT repuestos_uma_tenant_codigo_tipo_key UNIQUE (tenant_id, codigo, tipo);
