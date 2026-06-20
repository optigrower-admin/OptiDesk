-- ============================================================
-- MIGRACIÓN v39 — Seguimiento Ventas (reemplaza Pipeline)
-- Ejecutar DESPUÉS de migration_v38_garantias_campos.sql
-- Aditiva: no modifica ordenes, motos, medios, ni RLS existente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EXTENDER clientes
-- ------------------------------------------------------------
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS en_seguimiento_ventas       boolean DEFAULT false,

  ADD COLUMN IF NOT EXISTS primer_nombre               text,
  ADD COLUMN IF NOT EXISTS segundo_nombre              text,
  ADD COLUMN IF NOT EXISTS primer_apellido             text,
  ADD COLUMN IF NOT EXISTS segundo_apellido            text,

  ADD COLUMN IF NOT EXISTS direccion                   text,
  ADD COLUMN IF NOT EXISTS municipio                   text,
  ADD COLUMN IF NOT EXISTS ciudad                      text,
  ADD COLUMN IF NOT EXISTS descuentos                  text,
  ADD COLUMN IF NOT EXISTS lugar_matricula             text,

  ADD COLUMN IF NOT EXISTS etapa_venta                 text DEFAULT 'nuevo',
  ADD COLUMN IF NOT EXISTS etapa_venta_orden           integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_estimado_venta        numeric(12,2),
  ADD COLUMN IF NOT EXISTS proxima_accion              text,
  ADD COLUMN IF NOT EXISTS proxima_accion_fecha        timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_perdida              text,
  ADD COLUMN IF NOT EXISTS fecha_cierre                timestamptz,
  ADD COLUMN IF NOT EXISTS sin_respuesta_asesor_desde  timestamptz,

  ADD COLUMN IF NOT EXISTS forma_pago                  text,
  ADD COLUMN IF NOT EXISTS metodo_pago_id              uuid REFERENCES metodos_pago(id),
  ADD COLUMN IF NOT EXISTS credito_tiene_cuota_inicial boolean,
  ADD COLUMN IF NOT EXISTS cuota_inicial               numeric(12,2),
  ADD COLUMN IF NOT EXISTS cuota_deseada               numeric(12,2);

-- assigned_to ya existe en clientes (migration_v21). Se reutiliza tal cual.

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_etapa_venta_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_etapa_venta_check
  CHECK (etapa_venta IN (
    'nuevo','calificado','demo','propuesta','negociacion',
    'ganado','en_matricula','alistamiento','espera_entrega','entregada',
    'perdido'
  ));

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_forma_pago_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_forma_pago_check
  CHECK (forma_pago IS NULL OR forma_pago IN ('contado','credito'));

CREATE INDEX IF NOT EXISTS idx_clientes_seguimiento_ventas
  ON clientes(tenant_id, en_seguimiento_ventas, etapa_venta, etapa_venta_orden)
  WHERE en_seguimiento_ventas = true;

CREATE INDEX IF NOT EXISTS idx_clientes_proxima_accion
  ON clientes(tenant_id, proxima_accion_fecha)
  WHERE proxima_accion_fecha IS NOT NULL;

-- ------------------------------------------------------------
-- 2. HISTORIAL DE ETAPAS POR CLIENTE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_etapas_cliente (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  etapa_anterior  text,
  etapa_nueva     text NOT NULL,
  cambiado_por    uuid REFERENCES usuarios(id),
  dias_en_etapa   numeric(6,2),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_etapas_cliente_cliente
  ON historial_etapas_cliente(cliente_id, created_at);

-- ------------------------------------------------------------
-- 3. HISTORIAL DE ASIGNACIONES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_asignaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  usuario_anterior  uuid REFERENCES usuarios(id),
  usuario_nuevo     uuid REFERENCES usuarios(id),
  cambiado_por      uuid REFERENCES usuarios(id),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_asignaciones_cliente
  ON historial_asignaciones(cliente_id, created_at);

-- ------------------------------------------------------------
-- 4. TRIGGER COMBINADO: etapa + asignación
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_cambios_cliente()
RETURNS TRIGGER AS $$
DECLARE
  dias numeric;
BEGIN
  IF (OLD.etapa_venta IS DISTINCT FROM NEW.etapa_venta) THEN
    dias := EXTRACT(EPOCH FROM (now() - COALESCE(OLD.updated_at, OLD.created_at))) / 86400.0;

    INSERT INTO historial_etapas_cliente (
      cliente_id, tenant_id, etapa_anterior, etapa_nueva, cambiado_por, dias_en_etapa
    ) VALUES (
      NEW.id, NEW.tenant_id, OLD.etapa_venta, NEW.etapa_venta, NEW.assigned_to, dias
    );

    IF NEW.etapa_venta IN ('ganado','perdido') THEN
      NEW.fecha_cierre := now();
    END IF;
  END IF;

  IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) THEN
    INSERT INTO historial_asignaciones (
      cliente_id, tenant_id, usuario_anterior, usuario_nuevo, cambiado_por
    ) VALUES (
      NEW.id, NEW.tenant_id, OLD.assigned_to, NEW.assigned_to, COALESCE(auth.uid(), NEW.assigned_to)
    );
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cambios_cliente ON clientes;
CREATE TRIGGER trg_cambios_cliente
  BEFORE UPDATE ON clientes
  FOR EACH ROW
  EXECUTE FUNCTION registrar_cambios_cliente();

-- ------------------------------------------------------------
-- 5. VISIBILIDAD COMPARTIDA (solo Gerencia gestiona, validado en la app)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes_visibilidad (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  usuario_id    uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  agregado_por  uuid REFERENCES usuarios(id),
  created_at    timestamptz DEFAULT now(),
  UNIQUE(cliente_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_clientes_visibilidad_usuario ON clientes_visibilidad(usuario_id);
CREATE INDEX IF NOT EXISTS idx_clientes_visibilidad_cliente ON clientes_visibilidad(cliente_id);

-- ------------------------------------------------------------
-- 6. ENTIDADES FINANCIERAS + ESTUDIO DE CRÉDITO
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entidades_financieras (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  activa      boolean DEFAULT true,
  orden       integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clientes_credito_estudio (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  entidad_id       uuid NOT NULL REFERENCES entidades_financieras(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  estado           text NOT NULL DEFAULT 'sin_iniciar'
                     CHECK (estado IN ('sin_iniciar','en_estudio','aprobado','rechazado')),
  monto_aprobado   numeric(12,2),
  notas            text,
  actualizado_por  uuid REFERENCES usuarios(id),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(cliente_id, entidad_id)
);

CREATE INDEX IF NOT EXISTS idx_credito_estudio_cliente ON clientes_credito_estudio(cliente_id);

-- ------------------------------------------------------------
-- 7. CATÁLOGO DE MOTOS (precios) + SELECCIÓN DE INTERÉS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motos_catalogo (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  referencia         text NOT NULL,
  precio             numeric(12,2) NOT NULL DEFAULT 0,
  costo_documentos   numeric(12,2) NOT NULL DEFAULT 0,
  costo_prenda       numeric(12,2) NOT NULL DEFAULT 0,
  activa             boolean DEFAULT true,
  orden              integer DEFAULT 0,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clientes_motos_interes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  moto_catalogo_id  uuid NOT NULL REFERENCES motos_catalogo(id) ON DELETE CASCADE,
  disponibilidad    text NOT NULL DEFAULT 'pedir' CHECK (disponibilidad IN ('inventario','pedir')),
  created_at        timestamptz DEFAULT now(),
  created_by        uuid REFERENCES usuarios(id),
  UNIQUE(cliente_id, moto_catalogo_id)
);

CREATE INDEX IF NOT EXISTS idx_motos_interes_cliente ON clientes_motos_interes(cliente_id);

-- ------------------------------------------------------------
-- 8. RECARGO POR MÉTODO DE PAGO (datáfono / tarjeta = 5%)
-- ------------------------------------------------------------
ALTER TABLE metodos_pago
  ADD COLUMN IF NOT EXISTS recargo_porcentaje numeric(5,2) NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- 9. PASOS A SEGUIR (checklist)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes_pasos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  descripcion     text NOT NULL,
  completado      boolean DEFAULT false,
  completado_por  uuid REFERENCES usuarios(id),
  completado_at   timestamptz,
  orden           integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  created_by      uuid REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_clientes_pasos_cliente ON clientes_pasos(cliente_id, orden);

-- ------------------------------------------------------------
-- 10. COMENTARIOS CON AUTOR
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comentarios_cliente (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  texto       text NOT NULL,
  autor_id    uuid REFERENCES usuarios(id),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_cliente_cliente ON comentarios_cliente(cliente_id, created_at);

-- ------------------------------------------------------------
-- 11. ARCHIVOS POR CLIENTE (PDF/imagen/Excel/Word) — reutiliza R2
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS archivos_cliente (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url               text NOT NULL,
  tipo              text NOT NULL CHECK (tipo IN ('pdf','imagen','excel','word','otro')),
  nombre_archivo    text,
  tamano_bytes      bigint,
  storage_location  text NOT NULL DEFAULT 'r2' CHECK (storage_location IN ('r2','drive')),
  drive_url         text,
  subido_por        uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archivos_cliente_cliente ON archivos_cliente(cliente_id);

-- ------------------------------------------------------------
-- 12. RECORDATORIOS — ampliar para que apliquen a clientes (no solo conversaciones)
-- ------------------------------------------------------------
ALTER TABLE recordatorios
  ALTER COLUMN conversacion_id DROP NOT NULL;

ALTER TABLE recordatorios
  ADD COLUMN IF NOT EXISTS cliente_id        uuid REFERENCES clientes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS enviar_email      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_destino     text,
  ADD COLUMN IF NOT EXISTS email_enviado_at  timestamptz,
  ADD COLUMN IF NOT EXISTS tipo_automatico   text;

ALTER TABLE recordatorios DROP CONSTRAINT IF EXISTS recordatorios_origen_check;
ALTER TABLE recordatorios ADD CONSTRAINT recordatorios_origen_check
  CHECK (conversacion_id IS NOT NULL OR cliente_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_recordatorios_cliente
  ON recordatorios(cliente_id, fecha_recordatorio) WHERE cliente_id IS NOT NULL;

-- ------------------------------------------------------------
-- 13. TIPOS DE RECORDATORIO AUTOMÁTICO (Gerencia activa/desactiva)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipos_recordatorio_automatico (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN (
                 'credito_sin_iniciar','entrega_moto_pendiente','cliente_sin_movimiento'
               )),
  activo       boolean DEFAULT true,
  dias_umbral  integer DEFAULT 7,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(tenant_id, tipo)
);

-- ------------------------------------------------------------
-- 14. PLANTILLAS DE CORREO (Gerencia crea, todos los roles las usan)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantillas_correo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  asunto      text NOT NULL,
  cuerpo_html text NOT NULL,
  variables   text[] DEFAULT '{}',
  activa      boolean DEFAULT true,
  created_by  uuid REFERENCES usuarios(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 15. BACKFILL — preservar lo que ya está en Pipeline (conversaciones)
-- ------------------------------------------------------------
WITH conv_representativa AS (
  SELECT DISTINCT ON (cliente_id)
    cliente_id, etapa_venta, etapa_venta_orden, valor_estimado_venta,
    proxima_accion, proxima_accion_fecha, motivo_perdida, fecha_cierre,
    sin_respuesta_asesor_desde, moto_interes
  FROM conversaciones
  WHERE cliente_id IS NOT NULL
  ORDER BY cliente_id,
    CASE etapa_venta
      WHEN 'ganado' THEN 6 WHEN 'perdido' THEN 5 WHEN 'negociacion' THEN 4
      WHEN 'propuesta' THEN 3 WHEN 'demo' THEN 2 WHEN 'calificado' THEN 1 ELSE 0
    END DESC,
    updated_at DESC
)
UPDATE clientes c SET
  en_seguimiento_ventas      = true,
  etapa_venta                = cr.etapa_venta,
  etapa_venta_orden          = cr.etapa_venta_orden,
  valor_estimado_venta       = cr.valor_estimado_venta,
  proxima_accion             = cr.proxima_accion,
  proxima_accion_fecha       = cr.proxima_accion_fecha,
  motivo_perdida             = cr.motivo_perdida,
  fecha_cierre               = cr.fecha_cierre,
  sin_respuesta_asesor_desde = cr.sin_respuesta_asesor_desde
FROM conv_representativa cr
WHERE c.id = cr.cliente_id;

-- ------------------------------------------------------------
-- 16. RLS — mismo patrón de aislamiento por tenant que v21/v26/v27
-- ------------------------------------------------------------
ALTER TABLE historial_etapas_cliente       ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_asignaciones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_visibilidad           ENABLE ROW LEVEL SECURITY;
ALTER TABLE entidades_financieras          ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_credito_estudio       ENABLE ROW LEVEL SECURITY;
ALTER TABLE motos_catalogo                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_motos_interes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_pasos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE comentarios_cliente            ENABLE ROW LEVEL SECURITY;
ALTER TABLE archivos_cliente               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tipos_recordatorio_automatico  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_correo              ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='historial_etapas_cliente' AND policyname='tenant_isolation_hec') THEN
    CREATE POLICY "tenant_isolation_hec" ON historial_etapas_cliente FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='historial_asignaciones' AND policyname='tenant_isolation_ha') THEN
    CREATE POLICY "tenant_isolation_ha" ON historial_asignaciones FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clientes_visibilidad' AND policyname='tenant_isolation_cv') THEN
    CREATE POLICY "tenant_isolation_cv" ON clientes_visibilidad FOR ALL
      USING (cliente_id IN (SELECT id FROM clientes WHERE tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='entidades_financieras' AND policyname='tenant_isolation_ef') THEN
    CREATE POLICY "tenant_isolation_ef" ON entidades_financieras FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clientes_credito_estudio' AND policyname='tenant_isolation_cce') THEN
    CREATE POLICY "tenant_isolation_cce" ON clientes_credito_estudio FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='motos_catalogo' AND policyname='tenant_isolation_mc') THEN
    CREATE POLICY "tenant_isolation_mc" ON motos_catalogo FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clientes_motos_interes' AND policyname='tenant_isolation_cmi') THEN
    CREATE POLICY "tenant_isolation_cmi" ON clientes_motos_interes FOR ALL
      USING (cliente_id IN (SELECT id FROM clientes WHERE tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clientes_pasos' AND policyname='tenant_isolation_cp') THEN
    CREATE POLICY "tenant_isolation_cp" ON clientes_pasos FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comentarios_cliente' AND policyname='tenant_isolation_cc') THEN
    CREATE POLICY "tenant_isolation_cc" ON comentarios_cliente FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='archivos_cliente' AND policyname='tenant_isolation_ac') THEN
    CREATE POLICY "tenant_isolation_ac" ON archivos_cliente FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tipos_recordatorio_automatico' AND policyname='tenant_isolation_tra') THEN
    CREATE POLICY "tenant_isolation_tra" ON tipos_recordatorio_automatico FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='plantillas_correo' AND policyname='tenant_isolation_pc') THEN
    CREATE POLICY "tenant_isolation_pc" ON plantillas_correo FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

GRANT ALL ON historial_etapas_cliente, historial_asignaciones, clientes_visibilidad,
  entidades_financieras, clientes_credito_estudio, motos_catalogo, clientes_motos_interes,
  clientes_pasos, comentarios_cliente, archivos_cliente, tipos_recordatorio_automatico,
  plantillas_correo
  TO service_role;

-- ============================================================
-- FIN MIGRACIÓN v39
-- ============================================================
