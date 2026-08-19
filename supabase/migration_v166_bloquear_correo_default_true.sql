-- Las plantillas de correo nuevas deben bloquear el envío por defecto si falta
-- algún documento adjunto seleccionado (el checkbox ya se marca así en la UI,
-- esto solo cubre inserciones que no lo especifiquen explícitamente).
ALTER TABLE plantillas_correo ALTER COLUMN bloquear_si_falta_documento SET DEFAULT true;
