-- v35: allow multiple subcategories per order
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS subcategoria_servicio_ids UUID[] DEFAULT '{}';
