-- v112: Guardar el ID de la subcarpeta de Drive de cada orden
--
-- Antes, la carpeta de Drive de una orden se buscaba cada vez por nombre
-- (la placa). Si se corregía la placa después de subir fotos/videos, la
-- búsqueda por el nombre nuevo no encontraba la carpeta ya creada y Google
-- Drive creaba una carpeta duplicada, dejando el material repartido en dos
-- carpetas. Ahora se guarda el ID real de la carpeta en la orden para
-- reusarla siempre, y renombrarla en vez de crear una nueva cuando cambia
-- la placa.

ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
