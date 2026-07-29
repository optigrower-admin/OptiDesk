-- v101: Grupo "Automatizaciones" en Flujos + soporte para nodos de pipeline
--
-- Agrega una columna de agrupación a los flujos (para separar visualmente los
-- flujos de mensajería de las nuevas automatizaciones de pipeline, dentro del
-- mismo motor de flujos — un solo sistema, no dos paralelos).

ALTER TABLE flujos_automatizacion
  ADD COLUMN IF NOT EXISTS grupo TEXT NOT NULL DEFAULT 'mensajeria';
