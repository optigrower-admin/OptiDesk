-- v146: resumen de conversación cacheado, para pasarle contexto a la IA sin
-- reenviar el historial crudo completo en conversaciones largas (>20 mensajes).
-- resumen_hasta_at marca el created_at del último mensaje ya incorporado al
-- resumen, para saber cuándo hace falta regenerarlo (solo cuando aparecen
-- mensajes "viejos" nuevos que aún no están cubiertos — nunca en cada turno).

ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS resumen_ia TEXT;
ALTER TABLE conversaciones ADD COLUMN IF NOT EXISTS resumen_hasta_at TIMESTAMPTZ;
