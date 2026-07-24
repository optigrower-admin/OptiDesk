-- v97: Guarda nombre del usuario que aprobó la matrícula
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS aprobado_matricula_por TEXT;
