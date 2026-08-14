-- Permite ocultar una columna (etapa) del pipeline para un usuario específico,
-- además del control existente por rol (roles_ocultos).
ALTER TABLE etapas_pipeline ADD COLUMN IF NOT EXISTS usuarios_ocultos UUID[] DEFAULT '{}';
