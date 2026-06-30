-- Agrega un flag por tenant para activar/desactivar el envío de nuevas
-- fotos a Google Drive. Default TRUE para que los tenants que ya tienen
-- Drive configurado no noten un cambio de comportamiento.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS drive_para_nuevas boolean DEFAULT true;
