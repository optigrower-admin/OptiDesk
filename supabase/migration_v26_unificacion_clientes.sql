-- ============================================================
-- MIGRACIÓN v26 — Unificación de arquitectura de clientes
-- Ejecutar DESPUÉS de migration_v25_comentarios.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. ÍNDICE FALTANTE en conversaciones(cliente_id)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversaciones_cliente
  ON conversaciones(cliente_id);

-- ------------------------------------------------------------
-- 2. TABLA ventas_motos (compra cerrada de moto)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ventas_motos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id        uuid NOT NULL REFERENCES clientes(id),
  conversacion_id   uuid REFERENCES conversaciones(id),
  moto_id           uuid REFERENCES motos(id),

  modelo            text NOT NULL,
  valor_venta       numeric(12,2) NOT NULL DEFAULT 0,
  metodo_pago       text,
  financiacion      boolean DEFAULT false,
  asesor_id         uuid REFERENCES usuarios(id),

  fecha_venta       timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ventas_motos_cliente
  ON ventas_motos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_motos_tenant
  ON ventas_motos(tenant_id, fecha_venta DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_motos_conv
  ON ventas_motos(conversacion_id);

-- RLS
ALTER TABLE ventas_motos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ventas_motos' AND policyname = 'tenant_isolation_ventas_motos'
  ) THEN
    CREATE POLICY "tenant_isolation_ventas_motos"
      ON ventas_motos FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. VISTA 360 del cliente
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW vista_cliente_360 AS
SELECT
  c.id              AS cliente_id,
  c.tenant_id,
  c.nombre,
  c.celular,
  c.whatsapp_number,
  c.lead_source,
  c.assigned_to,
  COUNT(DISTINCT m.id)   AS total_motos,
  COUNT(DISTINCT o.id)   AS total_ordenes_servicio,
  COUNT(DISTINCT vm.id)  AS total_motos_compradas,
  COUNT(DISTINCT cv.id)  AS total_conversaciones,
  MAX(o.created_at)             AS ultima_orden_servicio,
  MAX(cv.ultimo_mensaje_at)     AS ultima_conversacion,
  COALESCE(SUM(vm.valor_venta), 0) AS valor_total_compras
FROM clientes c
LEFT JOIN motos m            ON m.cliente_id = c.id
LEFT JOIN ordenes o          ON o.cliente_id = c.id
LEFT JOIN ventas_motos vm    ON vm.cliente_id = c.id
LEFT JOIN conversaciones cv  ON cv.cliente_id = c.id
GROUP BY c.id, c.tenant_id, c.nombre, c.celular, c.whatsapp_number, c.lead_source, c.assigned_to;

-- ============================================================
-- FIN MIGRACIÓN v26
-- ============================================================
