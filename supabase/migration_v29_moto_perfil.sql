-- ============================================================
-- MIGRATION V29 — Perfil de moto + historial de propietarios
-- ============================================================

-- 1. Kilometraje en motos (si no existe ya)
ALTER TABLE motos ADD COLUMN IF NOT EXISTS kilometraje int;

-- 2. Tabla de historial de propietarios
CREATE TABLE IF NOT EXISTS historial_propietarios_moto (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moto_id     uuid NOT NULL REFERENCES motos(id)    ON DELETE CASCADE,
  cliente_id  uuid           REFERENCES clientes(id) ON DELETE SET NULL,
  tenant_id   uuid NOT NULL  REFERENCES tenants(id)  ON DELETE CASCADE,
  fecha_desde timestamptz DEFAULT now(),
  fecha_hasta timestamptz,        -- NULL = propietario actual
  notas       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_histprop_moto    ON historial_propietarios_moto(moto_id);
CREATE INDEX IF NOT EXISTS idx_histprop_cliente ON historial_propietarios_moto(cliente_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_histprop_activo  ON historial_propietarios_moto(moto_id) WHERE fecha_hasta IS NULL;

-- 3. RLS historial_propietarios_moto
ALTER TABLE historial_propietarios_moto ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'historial_propietarios_moto'
    AND   policyname = 'tenant_isolation_histprop'
  ) THEN
    CREATE POLICY "tenant_isolation_histprop"
      ON historial_propietarios_moto FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

-- 4. Poblar historial con los propietarios actuales
--    (fecha_desde = fecha de creación de la moto, como aproximación)
INSERT INTO historial_propietarios_moto (moto_id, cliente_id, tenant_id, fecha_desde)
SELECT id, cliente_id, tenant_id, created_at
FROM   motos
WHERE  cliente_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5. Trigger: registrar cambio de propietario automáticamente
CREATE OR REPLACE FUNCTION registrar_cambio_propietario()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    -- Cerrar registro anterior
    UPDATE historial_propietarios_moto
       SET fecha_hasta = NOW()
     WHERE moto_id = NEW.id AND fecha_hasta IS NULL;

    -- Abrir registro nuevo si hay nuevo dueño
    IF NEW.cliente_id IS NOT NULL THEN
      INSERT INTO historial_propietarios_moto (moto_id, cliente_id, tenant_id)
      VALUES (NEW.id, NEW.cliente_id, NEW.tenant_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cambio_propietario ON motos;
CREATE TRIGGER trg_cambio_propietario
  AFTER UPDATE ON motos
  FOR EACH ROW EXECUTE FUNCTION registrar_cambio_propietario();

-- 6. FKs en ordenes para vincular a moto y cliente reales
ALTER TABLE ordenes
  ADD COLUMN IF NOT EXISTS moto_id    uuid REFERENCES motos(id)    ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_moto_id    ON ordenes(moto_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_cliente_id ON ordenes(cliente_id);
