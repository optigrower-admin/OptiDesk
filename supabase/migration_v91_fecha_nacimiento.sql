-- ============================================================
-- V91: Fecha de nacimiento del cliente
-- ============================================================

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
