-- ============================================================
-- V87: Bandera para gestionar pago a proveedor por orden
-- Las órdenes antiguas quedan en false (comportamiento anterior).
-- Las nuevas órdenes se crean con true y exigen el flujo nuevo.
-- ============================================================

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS gestiona_pago_proveedor BOOLEAN NOT NULL DEFAULT false;
