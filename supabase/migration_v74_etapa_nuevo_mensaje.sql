-- Paso 1: Ampliar el CHECK constraint para incluir 'nuevo_mensaje'
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_etapa_venta_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_etapa_venta_check
  CHECK (etapa_venta IN (
    'nuevo_mensaje',
    'nuevo','con_objecion','seguimiento','buscando_credito',
    'calificado','demo','propuesta','negociacion',
    'ganado','en_matricula','alistamiento','espera_entrega','entregada',
    'perdido'
  ));

-- Paso 2: Mover al canal "Nuevo Contacto - Mensaje" todos los clientes en seguimiento
-- que tienen whatsapp_number, messenger_id o instagram_id registrado
-- y están actualmente en la etapa 'nuevo' o sin etapa definida.
UPDATE clientes
SET
  etapa_venta       = 'nuevo_mensaje',
  etapa_venta_orden = -1
WHERE
  en_seguimiento_ventas = true
  AND (etapa_venta = 'nuevo' OR etapa_venta IS NULL)
  AND (
    whatsapp_number IS NOT NULL
    OR messenger_id  IS NOT NULL
    OR instagram_id  IS NOT NULL
  );
