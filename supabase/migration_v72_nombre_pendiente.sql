-- Columna para marcar clientes cuyo nombre llegó de un canal externo y aún no ha sido confirmado
-- La tarjeta en el Kanban mostrará fondo amarillo mientras sea true
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS nombre_pendiente_aprobacion boolean DEFAULT false;
