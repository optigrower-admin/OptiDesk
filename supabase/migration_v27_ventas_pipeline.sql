-- ============================================================
-- MIGRACIÓN v27 — Módulo de Ventas (Pipeline Kanban)
-- Ejecutar DESPUÉS de migration_v26_unificacion_clientes.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. EXTENDER conversaciones con campos de venta
-- ------------------------------------------------------------
ALTER TABLE conversaciones
  ADD COLUMN IF NOT EXISTS moto_interes                  text,
  ADD COLUMN IF NOT EXISTS presupuesto_estimado          numeric(12,2),
  ADD COLUMN IF NOT EXISTS valor_estimado_venta          numeric(12,2),
  ADD COLUMN IF NOT EXISTS proxima_accion                text,
  ADD COLUMN IF NOT EXISTS proxima_accion_fecha          timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_perdida                text,
  ADD COLUMN IF NOT EXISTS fecha_cierre                  timestamptz,
  ADD COLUMN IF NOT EXISTS etapa_venta_orden             integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sin_respuesta_asesor_desde    timestamptz;

-- Índice para detectar conversaciones sin responder del asesor
CREATE INDEX IF NOT EXISTS idx_conv_sin_respuesta
  ON conversaciones(tenant_id, sin_respuesta_asesor_desde)
  WHERE sin_respuesta_asesor_desde IS NOT NULL;

-- Índice para el tablero kanban
CREATE INDEX IF NOT EXISTS idx_conv_pipeline
  ON conversaciones(tenant_id, assigned_to, etapa_venta, etapa_venta_orden);

-- Índice para próxima acción vencida
CREATE INDEX IF NOT EXISTS idx_conv_proxima_accion
  ON conversaciones(tenant_id, assigned_to, proxima_accion_fecha)
  WHERE proxima_accion_fecha IS NOT NULL;

-- ------------------------------------------------------------
-- 2. HISTORIAL DE ETAPAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_etapas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id   uuid NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  etapa_anterior    text,
  etapa_nueva       text NOT NULL,
  cambiado_por      uuid REFERENCES usuarios(id),
  dias_en_etapa     numeric(6,2),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_conv
  ON historial_etapas(conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_historial_tenant
  ON historial_etapas(tenant_id, etapa_nueva, created_at);

-- ------------------------------------------------------------
-- 3. RECORDATORIOS DE SEGUIMIENTO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recordatorios (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  conversacion_id     uuid NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  asignado_a          uuid REFERENCES usuarios(id),
  nota                text,
  fecha_recordatorio  timestamptz NOT NULL,
  tipo                text DEFAULT 'manual'
                        CHECK (tipo IN ('manual','seguimiento_auto','cita','llamada')),
  completado          boolean DEFAULT false,
  completado_at       timestamptz,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes
  ON recordatorios(tenant_id, asignado_a, fecha_recordatorio)
  WHERE completado = false;

-- ------------------------------------------------------------
-- 4. MOTIVOS DE PÉRDIDA CONFIGURABLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motivos_perdida (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  motivo      text NOT NULL,
  activo      boolean DEFAULT true,
  orden       integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. TABLA leads_campana (tracking UTM por conversación)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads_campana (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id   uuid NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  utm_content       text,
  utm_term          text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_campana_conv
  ON leads_campana(conversacion_id);
CREATE INDEX IF NOT EXISTS idx_leads_campana_tenant
  ON leads_campana(tenant_id, utm_campaign);

ALTER TABLE leads_campana ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='leads_campana' AND policyname='tenant_isolation_leads_campana'
  ) THEN
    CREATE POLICY "tenant_isolation_leads_campana" ON leads_campana FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

GRANT ALL ON leads_campana TO service_role;

-- ------------------------------------------------------------
-- 6. TRIGGER: registrar cambio de etapa automáticamente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_cambio_etapa()
RETURNS TRIGGER AS $$
DECLARE
  dias numeric;
BEGIN
  IF (OLD.etapa_venta IS DISTINCT FROM NEW.etapa_venta) THEN
    dias := EXTRACT(EPOCH FROM (now() - COALESCE(OLD.updated_at, OLD.created_at))) / 86400.0;

    INSERT INTO historial_etapas (
      conversacion_id, tenant_id, etapa_anterior, etapa_nueva,
      cambiado_por, dias_en_etapa
    ) VALUES (
      NEW.id, NEW.tenant_id, OLD.etapa_venta, NEW.etapa_venta,
      NEW.assigned_to, dias
    );

    IF NEW.etapa_venta IN ('ganado','perdido') THEN
      NEW.fecha_cierre := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cambio_etapa ON conversaciones;
CREATE TRIGGER trg_cambio_etapa
  BEFORE UPDATE ON conversaciones
  FOR EACH ROW
  EXECUTE FUNCTION registrar_cambio_etapa();

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
ALTER TABLE historial_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivos_perdida ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='historial_etapas' AND policyname='tenant_isolation_historial'
  ) THEN
    CREATE POLICY "tenant_isolation_historial" ON historial_etapas FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='recordatorios' AND policyname='tenant_isolation_recordatorios'
  ) THEN
    CREATE POLICY "tenant_isolation_recordatorios" ON recordatorios FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='motivos_perdida' AND policyname='tenant_isolation_motivos'
  ) THEN
    CREATE POLICY "tenant_isolation_motivos" ON motivos_perdida FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 7. GRANTS para service role
-- ------------------------------------------------------------
GRANT ALL ON historial_etapas TO service_role;
GRANT ALL ON recordatorios TO service_role;
GRANT ALL ON motivos_perdida TO service_role;
GRANT ALL ON ventas_motos TO service_role;

-- ============================================================
-- FIN MIGRACIÓN v27
-- ============================================================
