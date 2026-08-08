-- v156: la opcion "ver todo el equipo" para admin debe poder marcarse por
-- separado para cada tipo de reporte (📊 pipeline vs 🔧 Servicio Tecnico),
-- no como un solo interruptor global. Reemplaza la columna unica de v155.

ALTER TABLE public.usuarios
  DROP COLUMN IF EXISTS reportes_ve_todo;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS reportes_ve_todo_pipeline BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reportes_ve_todo_st       BOOLEAN NOT NULL DEFAULT false;
