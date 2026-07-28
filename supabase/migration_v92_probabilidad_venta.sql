-- ============================================================
-- V92: Probabilidad de venta del cliente (0-100%, de 10 en 10)
-- ============================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS probabilidad_venta SMALLINT;

ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_probabilidad_venta_check;

ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_probabilidad_venta_check
  CHECK (probabilidad_venta IS NULL OR (probabilidad_venta BETWEEN 0 AND 100 AND probabilidad_venta % 10 = 0));
