-- Dos ajustes configurables por agente:
-- - analiza_imagenes: si el agente analiza con visión las fotos que manda
--   el cliente por chat (antes era fijo, siempre activo).
-- - tiempo_espera_mensajes_seg: cuánto espera el bot tras un mensaje antes
--   de responder, por si el cliente manda varios seguidos (ej. 2 fotos para
--   "ambas caras" de la cédula) — antes era un fijo de 8s en el código.
ALTER TABLE agentes_ia ADD COLUMN IF NOT EXISTS analiza_imagenes boolean DEFAULT true;
ALTER TABLE agentes_ia ADD COLUMN IF NOT EXISTS tiempo_espera_mensajes_seg integer DEFAULT 8;
