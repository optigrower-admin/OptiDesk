-- Permite marcar una plantilla de correo para que no se pueda enviar si al
-- cliente le falta subir alguno de los documentos seleccionados para adjuntar.
ALTER TABLE plantillas_correo ADD COLUMN IF NOT EXISTS bloquear_si_falta_documento boolean DEFAULT false;
