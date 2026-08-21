-- Permite elegir a qué usuarios les llegan las notificaciones push de
-- mensajes nuevos (antes le llegaban a TODOS los que tuvieran una
-- suscripción push activa, sin poder desactivarlo por usuario).
-- Default true para no cambiar el comportamiento de nadie hasta que
-- gerencia decida apagarlo explícitamente en Config Ventas.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recibe_notificaciones_mensajes boolean DEFAULT true;
