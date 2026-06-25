-- ============================================================
-- MIGRACIÓN v59 — Ingreso a Caja (entrada manual de dinero)
--
-- Botón "+ Ingreso a caja" en el panel de Caja: permite registrar
-- una entrada de dinero manual (no asociada a una orden) con
-- descripción + método de pago + monto. Es el espejo de "Gastos de
-- Caja" (gastos_caja) pero sumando a la cuenta en vez de restar.
-- ============================================================

CREATE TABLE IF NOT EXISTS ingresos_caja (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  descripcion     TEXT NOT NULL,
  monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago_id  UUID NOT NULL REFERENCES metodos_pago(id),
  fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
  registrado_por  UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingresos_caja_tenant_fecha ON ingresos_caja(tenant_id, fecha);

ALTER TABLE ingresos_caja ENABLE ROW LEVEL SECURITY;

-- Mismo esquema de permisos que gastos_caja tras v50/v51: cualquiera con
-- acceso a Caja puede ver y crear; solo Gerencia/Admin pueden editar o eliminar.
CREATE POLICY "tenant_select_ingresos_caja" ON ingresos_caja
  FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_insert_ingresos_caja" ON ingresos_caja
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "gerencia_admin_update_ingresos_caja" ON ingresos_caja
  FOR UPDATE USING (get_user_role() IN ('gerencia', 'admin', 'control_total') AND tenant_id = get_user_tenant_id());
CREATE POLICY "gerencia_admin_delete_ingresos_caja" ON ingresos_caja
  FOR DELETE USING (get_user_role() IN ('gerencia', 'admin', 'control_total') AND tenant_id = get_user_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON ingresos_caja TO authenticated;
GRANT ALL ON ingresos_caja TO service_role;

-- ============================================================
-- FIN MIGRACIÓN v59
-- ============================================================
