-- Migration v79: expand flujos_automatizacion.trigger_tipo allowed values
-- Previous constraint only allowed: mensaje_nuevo, lead_ad, comentario_post, sin_respuesta_24h
-- New UI adds: etapa_cambiada, nuevo_cliente

-- Drop the inline check constraint (Postgres generates a name like flujos_automatizacion_trigger_tipo_check)
ALTER TABLE flujos_automatizacion
  DROP CONSTRAINT IF EXISTS flujos_automatizacion_trigger_tipo_check;

-- Re-add with full list of allowed values
ALTER TABLE flujos_automatizacion
  ADD CONSTRAINT flujos_automatizacion_trigger_tipo_check
  CHECK (trigger_tipo IN (
    'mensaje_nuevo',
    'lead_ad',
    'comentario_post',
    'sin_respuesta_24h',
    'etapa_cambiada',
    'nuevo_cliente'
  ));
