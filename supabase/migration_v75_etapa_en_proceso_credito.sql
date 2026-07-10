-- Ampliar CHECK constraint para incluir 'en_proceso_credito'
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_etapa_venta_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_etapa_venta_check
  CHECK (etapa_venta IN (
    'nuevo_mensaje',
    'nuevo','con_objecion','seguimiento','buscando_credito',
    'en_proceso_credito',
    'calificado','demo','propuesta','negociacion',
    'ganado','en_matricula','alistamiento','espera_entrega','entregada',
    'perdido'
  ));
