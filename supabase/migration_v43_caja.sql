-- ============================================================
-- MIGRACIÓN v43 — Caja (Servicio Técnico y Repuestos)
-- Ejecutar DESPUÉS de migration_v42_grants_seguimiento_ventas.sql
--
-- La Caja se calcula leyendo directamente las tablas que ya existen
-- (pagos_orden = ingresos, movimientos_inventario = costo de
-- repuestos externos/terceros), así que ya refleja TODO el histórico
-- sin necesidad de migrar datos. Lo único nuevo es la tabla para
-- registrar manualmente los "Gastos de Caja".
-- ============================================================

CREATE TABLE IF NOT EXISTS gastos_caja (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  descripcion     text NOT NULL,
  monto           numeric(12,2) NOT NULL CHECK (monto > 0),
  fecha           timestamptz NOT NULL DEFAULT now(),
  registrado_por  uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gastos_caja_tenant_fecha ON gastos_caja(tenant_id, fecha);

ALTER TABLE gastos_caja ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'gastos_caja' AND policyname = 'tenant_isolation_gastos_caja'
  ) THEN
    CREATE POLICY "tenant_isolation_gastos_caja" ON gastos_caja FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

-- Permiso para usuarios logueados (sin esto, la pantalla de Caja
-- devolvería 403 igual que pasó con Seguimiento Ventas en v39).
GRANT SELECT, INSERT, UPDATE, DELETE ON gastos_caja TO authenticated;
GRANT ALL ON gastos_caja TO service_role;

-- pagos_orden (migration_v19) nunca tuvo un GRANT explícito a
-- "authenticated" — se agrega aquí por seguridad, ya que la Caja
-- depende de poder leerla directo desde el navegador.
GRANT SELECT, INSERT, UPDATE, DELETE ON pagos_orden TO authenticated;

-- ============================================================
-- FIN MIGRACIÓN v43
-- ============================================================
