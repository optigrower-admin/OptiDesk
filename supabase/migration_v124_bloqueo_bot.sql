-- v124: flag para bloquear a un cliente de que el bot le siga escribiendo
-- (usado por el nodo "Acción de conversación" → subtipo "Bloquear usuario"
-- del nuevo constructor de Flujos, estilo LucidBot).

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS bot_bloqueado BOOLEAN NOT NULL DEFAULT false;
