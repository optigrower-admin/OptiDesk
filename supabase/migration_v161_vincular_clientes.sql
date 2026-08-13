-- v161: Vincular dos clientes en Seguimiento Ventas (ej. esposos, padre e
-- hijo) — desde la ficha de un cliente se puede vincular a otro cliente ya
-- existente del mismo tenant, y se ve el vínculo desde cualquiera de las
-- dos fichas (columna se guarda en un solo lado, se resuelve en ambos
-- sentidos desde el código).

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS vinculado_a_id UUID REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_vinculado_a ON clientes(vinculado_a_id);
