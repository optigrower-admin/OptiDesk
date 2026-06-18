-- Migration v38: campos especiales para ordenes de tipo "Garantías" (subcategoría
-- UMA). En vez del campo único "descripción del trabajo", estas órdenes usan
-- dos campos separados: lo que manifiesta el cliente y el diagnóstico del taller.

ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS manifiesta_cliente text;
ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS diagnostico text;
