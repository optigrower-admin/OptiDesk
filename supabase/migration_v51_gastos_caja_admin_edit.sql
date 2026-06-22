-- ============================================================
-- MIGRACIÓN v51 — Admin también puede editar/eliminar Gastos de Caja
--
-- v50 restringió editar/eliminar gastos_caja (incluye las
-- transferencias a profesional/caja fuerte) a Gerencia/control_total.
-- El usuario pidió que Admin también pueda hacerlo. Los ajustes_caja
-- siguen exclusivos de Gerencia/control_total (no se tocan aquí) —
-- eso fue un requisito explícito y distinto.
-- ============================================================

DROP POLICY IF EXISTS "gerencia_update_gastos_caja" ON gastos_caja;
CREATE POLICY "gerencia_admin_update_gastos_caja" ON gastos_caja
  FOR UPDATE USING (get_user_role() IN ('gerencia', 'admin', 'control_total') AND tenant_id = get_user_tenant_id());

DROP POLICY IF EXISTS "gerencia_delete_gastos_caja" ON gastos_caja;
CREATE POLICY "gerencia_admin_delete_gastos_caja" ON gastos_caja
  FOR DELETE USING (get_user_role() IN ('gerencia', 'admin', 'control_total') AND tenant_id = get_user_tenant_id());

-- ============================================================
-- FIN MIGRACIÓN v51
-- ============================================================
