-- Migration v94: Permitir UPDATE en ajustes_caja para Gerencia/Dueño
-- La tabla siempre tuvo SELECT, INSERT y DELETE pero faltaba la política UPDATE,
-- lo que impedía editar la fecha de un ajuste desde el modal de caja.

CREATE POLICY "gerencia_update_ajustes_caja" ON ajustes_caja
  FOR UPDATE USING (
    get_user_role() IN ('gerencia', 'control_total', 'dueno')
    AND tenant_id = get_user_tenant_id()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ajustes_caja TO authenticated;
