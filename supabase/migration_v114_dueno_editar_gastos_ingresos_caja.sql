-- v114: El rol dueño no podía editar/eliminar Gastos ni Ingresos de Caja
--
-- La UI ya mostraba el botón de editar/eliminar a dueño (esGerencia incluye
-- 'dueno' desde antes), pero las políticas RLS de gastos_caja e ingresos_caja
-- (v51/v59) solo permitían gerencia/admin/control_total. Supabase rechazaba
-- el UPDATE/DELETE en silencio (sin lanzar error, simplemente 0 filas
-- afectadas), por lo que el cambio parecía "no cargar" — la app actuaba como
-- si hubiera guardado pero el valor nunca cambiaba en la base de datos.

DROP POLICY IF EXISTS "gerencia_admin_update_gastos_caja" ON gastos_caja;
CREATE POLICY "gerencia_admin_update_gastos_caja" ON gastos_caja
  FOR UPDATE USING (get_user_role() IN ('gerencia', 'admin', 'control_total', 'dueno') AND tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "gerencia_admin_delete_gastos_caja" ON gastos_caja;
CREATE POLICY "gerencia_admin_delete_gastos_caja" ON gastos_caja
  FOR DELETE USING (get_user_role() IN ('gerencia', 'admin', 'control_total', 'dueno') AND tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "gerencia_admin_update_ingresos_caja" ON ingresos_caja;
CREATE POLICY "gerencia_admin_update_ingresos_caja" ON ingresos_caja
  FOR UPDATE USING (get_user_role() IN ('gerencia', 'admin', 'control_total', 'dueno') AND tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "gerencia_admin_delete_ingresos_caja" ON ingresos_caja;
CREATE POLICY "gerencia_admin_delete_ingresos_caja" ON ingresos_caja
  FOR DELETE USING (get_user_role() IN ('gerencia', 'admin', 'control_total', 'dueno') AND tenant_id = get_user_tenant_id());
