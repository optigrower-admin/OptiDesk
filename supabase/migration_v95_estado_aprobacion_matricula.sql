-- Migration v95: Columna estado_aprobacion_matricula en clientes
-- El código de seguimiento de ventas la lee y escribe desde la etapa
-- "aprobado_matricula" para controlar si gerencia aprobó el trámite.
-- Sin esta columna el SELECT de ventas/page.tsx falla y devuelve 0 clientes.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS estado_aprobacion_matricula TEXT
    DEFAULT 'pendiente'
    CHECK (estado_aprobacion_matricula IN ('pendiente', 'aprobado', 'rechazado'));
