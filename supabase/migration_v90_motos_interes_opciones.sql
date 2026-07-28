-- ============================================================
-- V90: Opciones de compra por moto de interés
-- Con papeles / Con tarjeta / Pignorada, para calcular el precio
-- exacto segun lo que elija el asesor en la ficha del cliente.
-- ============================================================

ALTER TABLE public.clientes_motos_interes
  ADD COLUMN IF NOT EXISTS con_papeles BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS con_tarjeta BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pignorada   BOOLEAN NOT NULL DEFAULT false;
