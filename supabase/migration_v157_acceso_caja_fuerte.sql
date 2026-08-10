-- v157: permite dar acceso a "Caja fuerte" (saldo + transacciones) a un
-- usuario específico sin importar su rol — hoy solo gerencia/dueño la ven.
-- Se activa/desactiva por persona en Mi equipo (Efectivo y Nequi ya eran
-- visibles para todos los roles, solo Caja fuerte estaba restringida).

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS acceso_caja_fuerte BOOLEAN NOT NULL DEFAULT false;
