-- v158: revisión de gerencia/dueño al perder un cliente en el pipeline.
-- Al entrar a la etapa "perdido" queda "falta_revision"; gerencia/dueño la
-- marca como "revisado" desde la ficha del cliente.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS revision_perdida TEXT CHECK (revision_perdida IN ('falta_revision', 'revisado')),
  ADD COLUMN IF NOT EXISTS revisado_perdida_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revisado_perdida_at TIMESTAMPTZ;
