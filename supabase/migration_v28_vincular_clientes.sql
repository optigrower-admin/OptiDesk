-- ============================================================
-- MIGRATION V28 — Vincular / fusionar clientes multi-canal
-- ============================================================
-- Un cliente real puede tener conversaciones en varios canales
-- (WhatsApp, Instagram, Messenger). Al vincular, todas las
-- conversaciones del cliente temporal pasan al cliente real y
-- el temporal queda marcado para borrado automático a las 48h.
-- ============================================================

-- 1. Campos de fusión en clientes
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS fusionado_con_id uuid REFERENCES clientes(id),
  ADD COLUMN IF NOT EXISTS fusionado_at     timestamptz;

-- Índice para el cron de limpieza
CREATE INDEX IF NOT EXISTS idx_clientes_fusionados
  ON clientes(fusionado_at)
  WHERE fusionado_con_id IS NOT NULL;

-- 2. Aseguramos que las queries normales excluyan fusionados
--    (las vistas/queries deben filtrar WHERE fusionado_con_id IS NULL)
--    No cambiamos RLS para no romper nada; el filtro va en código.
