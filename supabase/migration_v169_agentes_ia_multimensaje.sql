-- Permite que un Agente IA responda en varios mensajes de WhatsApp seguidos
-- (más natural, como escribiría una persona real) en vez de un solo mensaje
-- largo. Cuando está activo, el agente puede separar su respuesta con el
-- separador § y el motor de flujos manda cada parte como su propio mensaje.
ALTER TABLE agentes_ia ADD COLUMN IF NOT EXISTS respuesta_multimensaje boolean DEFAULT false;
