-- Marca un medio (video) como "procesando" mientras la conversión a mp4
-- corre en segundo plano, para que la galería muestre un placeholder en vez
-- de intentar reproducir el archivo original (mov/3gpp/etc.) que puede no
-- ser compatible en todos los navegadores/dispositivos.
ALTER TABLE medios ADD COLUMN IF NOT EXISTS procesando BOOLEAN NOT NULL DEFAULT false;
