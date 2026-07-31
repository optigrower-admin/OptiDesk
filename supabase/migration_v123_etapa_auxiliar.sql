-- v123: marca de "etapa auxiliar" — estados que existen fuera de la secuencia
-- normal del pipeline (ej. "Cliente Perdido"), para que las reglas que se
-- heredan en cascada por orden (como "Aprobación de gerencia") no se les
-- apliquen por accidente solo por tener un número de orden alto.

ALTER TABLE etapas_pipeline
  ADD COLUMN IF NOT EXISTS es_auxiliar BOOLEAN NOT NULL DEFAULT false;
