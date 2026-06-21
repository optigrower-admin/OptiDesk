-- ============================================================
-- MIGRACIÓN v50 — Ajustes de Caja (solo Gerencia)
--
-- Permite a Gerencia registrar un ajuste manual sobre una cuenta
-- (método de pago) específica en Caja, dejando registro de quién y
-- cuándo lo hizo. También restringe editar/eliminar gastos de caja
-- (incluye las transferencias, que se guardan en la misma tabla) a
-- Gerencia — crear un gasto sigue abierto a quien ya tiene acceso a
-- Caja (admin/gerencia), igual que hasta ahora.
-- ============================================================

CREATE TABLE IF NOT EXISTS ajustes_caja (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  descripcion     TEXT NOT NULL,
  monto           NUMERIC(12,2) NOT NULL, -- con signo: positivo suma a la cuenta, negativo resta
  metodo_pago_id  UUID NOT NULL REFERENCES metodos_pago(id),
  fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
  registrado_por  UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ajustes_caja_tenant_fecha ON ajustes_caja(tenant_id, fecha);

ALTER TABLE ajustes_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select_ajustes_caja" ON ajustes_caja
  FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "gerencia_insert_ajustes_caja" ON ajustes_caja
  FOR INSERT WITH CHECK (get_user_role() IN ('gerencia', 'control_total') AND tenant_id = get_user_tenant_id());
CREATE POLICY "gerencia_delete_ajustes_caja" ON ajustes_caja
  FOR DELETE USING (get_user_role() IN ('gerencia', 'control_total') AND tenant_id = get_user_tenant_id());

GRANT SELECT, INSERT, DELETE ON ajustes_caja TO authenticated;
GRANT ALL ON ajustes_caja TO service_role;

-- Restringir editar/eliminar gastos de caja (y transferencias) a Gerencia.
-- La política anterior ("tenant_isolation_gastos_caja", FOR ALL) seguía
-- permitiendo UPDATE/DELETE a cualquier miembro del tenant — se reemplaza
-- por políticas específicas: cualquiera con acceso a Caja puede ver y
-- crear, solo Gerencia puede editar o eliminar.
DROP POLICY IF EXISTS "tenant_isolation_gastos_caja" ON gastos_caja;
CREATE POLICY "tenant_select_gastos_caja" ON gastos_caja
  FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_insert_gastos_caja" ON gastos_caja
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "gerencia_update_gastos_caja" ON gastos_caja
  FOR UPDATE USING (get_user_role() IN ('gerencia', 'control_total') AND tenant_id = get_user_tenant_id());
CREATE POLICY "gerencia_delete_gastos_caja" ON gastos_caja
  FOR DELETE USING (get_user_role() IN ('gerencia', 'control_total') AND tenant_id = get_user_tenant_id());

-- ============================================================
-- FIN MIGRACIÓN v50
-- ============================================================
