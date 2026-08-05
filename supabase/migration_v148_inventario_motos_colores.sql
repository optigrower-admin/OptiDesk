-- v148: Inventario de motos por color — reutiliza el catálogo de colores que
-- ya existe por moto (motos_catalogo_colores, de la Lista de Precios). Si una
-- moto no tiene colores definidos en el catálogo, se sigue llevando un único
-- renglón de inventario sin color (color_id NULL), igual que hasta ahora.

ALTER TABLE inventario_motos ADD COLUMN IF NOT EXISTS color_id UUID REFERENCES motos_catalogo_colores(id) ON DELETE CASCADE;

-- La UNIQUE anterior era (tenant_id, moto_catalogo_id) — ahora debe permitir
-- varios renglones por moto (uno por color).
ALTER TABLE inventario_motos DROP CONSTRAINT IF EXISTS inventario_motos_tenant_id_moto_catalogo_id_key;
ALTER TABLE inventario_motos ADD CONSTRAINT inventario_motos_tenant_moto_color_key UNIQUE (tenant_id, moto_catalogo_id, color_id);
