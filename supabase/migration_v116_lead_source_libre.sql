-- v116: Permitir cualquier valor de "Origen" (lead_source) en clientes
--
-- clientes.lead_source tenía un CHECK constraint desde migration_v21 que solo
-- permitía 5 valores fijos ('concesionario','evento','referido','frio',
-- 'redes_sociales'). El campo "Origen" de la ficha de cliente ya permite
-- escribir y agregar cualquier valor nuevo (se guarda con un update directo),
-- pero ese constraint rechazaba en silencio cualquier valor fuera de esa
-- lista — por eso los orígenes nuevos "no se guardaban": la app mostraba el
-- valor localmente pero la base de datos nunca lo aceptaba.

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_lead_source_check;
