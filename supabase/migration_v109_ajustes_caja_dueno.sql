-- v109: El rol "dueño" puede usar Caja Fuerte igual que gerencia
--
-- La UI ya trataba a dueño como gerencia en varios lugares, pero las
-- políticas de INSERT y DELETE de ajustes_caja (que es lo que respalda los
-- ajustes/transferencias de Caja Fuerte) se quedaron solo en
-- ('gerencia','admin','control_total') — dueño se había agregado únicamente
-- a la política de UPDATE (migration_v94). Esto lo empareja.

DROP POLICY IF EXISTS "gerencia_admin_insert_ajustes_caja" ON ajustes_caja;
CREATE POLICY "gerencia_admin_insert_ajustes_caja" ON ajustes_caja
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'admin', 'control_total', 'dueno'));

DROP POLICY IF EXISTS "gerencia_delete_ajustes_caja" ON ajustes_caja;
CREATE POLICY "gerencia_delete_ajustes_caja" ON ajustes_caja
  FOR DELETE
  USING (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total', 'dueno'));
