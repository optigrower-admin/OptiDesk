-- ============================================================
-- MIGRACIÓN v58 — Nuevo estado "Programado" en Servicio Técnico
--
-- Estado nuevo, antes de "Falta revisión": el cliente agendó una cita pero
-- la moto todavía no ha llegado al taller. Guarda la fecha/hora programada
-- y la duración estimada del servicio en horas.
-- ============================================================

ALTER TABLE ordenes DROP CONSTRAINT IF EXISTS ordenes_estado_check;
ALTER TABLE ordenes ADD CONSTRAINT ordenes_estado_check
  CHECK (estado IN ('programado', 'falta_revision', 'en_proceso', 'pendiente', 'pagado', 'listo'));

ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS fecha_programada TIMESTAMPTZ;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS duracion_estimada_horas NUMERIC(5,2);

-- FIN MIGRACIÓN v58
