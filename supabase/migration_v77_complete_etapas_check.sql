-- Actualizar CHECK constraint con TODAS las etapas del pipeline
-- Agrega las que faltaban: con_interes, aprobado_matricula, primera/segunda/tercera_revision, proceso_finalizado
-- También asegura nuevo_mensaje y en_proceso_credito (por si v74/v75 no se corrieron)
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_etapa_venta_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_etapa_venta_check
  CHECK (etapa_venta IN (
    'nuevo_mensaje',
    'nuevo', 'con_interes', 'con_objecion',
    'propuesta', 'demo',
    'seguimiento', 'buscando_credito', 'en_proceso_credito',
    'calificado', 'negociacion',
    'ganado',
    'aprobado_matricula', 'en_matricula', 'alistamiento', 'espera_entrega', 'entregada',
    'primera_revision', 'segunda_revision', 'tercera_revision',
    'proceso_finalizado',
    'perdido'
  ));
