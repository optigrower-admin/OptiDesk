-- Migration v92: Campo fecha_entrega en clientes
-- Permite registrar la fecha real de entrega de la moto al cliente
-- Se muestra en la ficha de seguimiento de ventas desde la etapa espera_entrega en adelante

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS fecha_entrega date;
