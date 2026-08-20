-- La política "admin_update_clientes" (desde migration_v5) solo permitía
-- actualizar la tabla clientes a los roles admin/gerencia/control_total.
-- Cualquier otro rol (asesor_comercial, freelancer, mecánico) que editara un
-- campo de la ficha (nombre, celular, carta de negociación, factura, fecha de
-- entrega, etc.) veía el guardado "funcionar" sin ningún error, pero la
-- actualización quedaba filtrada en silencio por RLS — 0 filas afectadas, sin
-- excepción — así que nunca se guardaba de verdad.
--
-- El control fino de quién puede editar y en qué etapa ya lo maneja la propia
-- app (etapas_bloqueo_rol + rolesBloqueados en el frontend), así que esta
-- restricción a nivel de base de datos sobra y solo rompía guardados.
DROP POLICY IF EXISTS "admin_update_clientes" ON clientes;
CREATE POLICY "tenant_update_clientes" ON clientes
  FOR UPDATE USING (tenant_id = get_user_tenant_id());
