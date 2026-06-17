-- v34: Agregar campo kilometraje a motos
ALTER TABLE motos ADD COLUMN IF NOT EXISTS kilometraje INTEGER;
