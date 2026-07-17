-- Ampliar el CHECK constraint de etapa_venta para incluir las nuevas etapas
-- 'seguimiento' y 'buscando_credito' añadidas en pipeline.ts

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_etapa_venta_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_etapa_venta_check
  CHECK (etapa_venta IN (
    'nuevo','seguimiento','buscando_credito',
    'calificado','demo','propuesta','negociacion',
    'ganado','en_matricula','alistamiento','espera_entrega','entregada',
    'perdido'
  ));
