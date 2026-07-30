-- v110: Pago a Colaborador — nueva categoría de Caja
--
-- No es gasto, ni ajuste, ni transferencia, ni ingreso: es un pago a un
-- usuario/colaborador de la empresa (comisión, préstamo, bono...), que sí
-- descuenta de la cuenta (Nequi/Efectivo) elegida, igual que un gasto.
-- Se guarda en su propia tabla para poder registrar a QUÉ usuario se le
-- pagó (usuario_pagado_id), algo que gastos_caja no modela.

CREATE TABLE IF NOT EXISTS pagos_colaborador_caja (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  descripcion        TEXT NOT NULL,
  monto              NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago_id     UUID NOT NULL REFERENCES metodos_pago(id),
  usuario_pagado_id  UUID NOT NULL REFERENCES usuarios(id),
  fecha              TIMESTAMPTZ NOT NULL DEFAULT now(),
  registrado_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_colaborador_caja_tenant_fecha ON pagos_colaborador_caja(tenant_id, fecha);

ALTER TABLE pagos_colaborador_caja ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que gastos_caja (v50): ver/crear abierto a quien tiene acceso
-- a Caja, editar/eliminar solo gerencia/dueño/control_total.
CREATE POLICY "tenant_select_pagos_colaborador_caja" ON pagos_colaborador_caja
  FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_insert_pagos_colaborador_caja" ON pagos_colaborador_caja
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id());
CREATE POLICY "gerencia_update_pagos_colaborador_caja" ON pagos_colaborador_caja
  FOR UPDATE USING (get_user_role() IN ('gerencia', 'control_total', 'dueno') AND tenant_id = get_user_tenant_id());
CREATE POLICY "gerencia_delete_pagos_colaborador_caja" ON pagos_colaborador_caja
  FOR DELETE USING (get_user_role() IN ('gerencia', 'control_total', 'dueno') AND tenant_id = get_user_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pagos_colaborador_caja TO anon, authenticated, service_role;
