-- v144: fecha en que se registró el número de carta de negociación —
-- se guarda automáticamente la primera vez que se llena numero_carta_negociacion.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_carta_negociacion TIMESTAMPTZ;

UPDATE clientes SET fecha_carta_negociacion = COALESCE(fecha_cierre, created_at)
WHERE numero_carta_negociacion IS NOT NULL AND numero_carta_negociacion <> ''
  AND fecha_carta_negociacion IS NULL;
