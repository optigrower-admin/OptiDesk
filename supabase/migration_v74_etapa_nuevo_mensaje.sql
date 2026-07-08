-- Mover al canal "Nuevo Contacto - Mensaje" todos los clientes en seguimiento
-- que tienen whatsapp_number, messenger_id o instagram_id registrado
-- y están actualmente en la etapa 'nuevo' (asignada por el webhook anterior)
-- o sin etapa definida.
-- Esto incluye los contactos que ya estaban en la BD con canal pero aún
-- figuraban como 'nuevo'.

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
