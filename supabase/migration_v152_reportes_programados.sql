-- v152: motor general de reportes programados (reemplaza el toggle único
-- "resumen de pipeline diario" de v151 por N envíos configurables por
-- persona: canal, hora, frecuencia, período a mostrar y asunto editable).
-- usuarios.recibe_resumen_pipeline (v151) queda sin usarse, no se elimina.

CREATE TABLE IF NOT EXISTS reportes_programados (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id        UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, -- de quién son los datos del reporte
  tipo_reporte      TEXT NOT NULL CHECK (tipo_reporte IN ('pipeline', 'servicio_tecnico')),
  nombre            TEXT NOT NULL DEFAULT 'Envío',
  asunto            TEXT NOT NULL,
  canal_correo      BOOLEAN NOT NULL DEFAULT true,
  canal_whatsapp    BOOLEAN NOT NULL DEFAULT false,
  hora_envio        TIME NOT NULL DEFAULT '08:00',
  frecuencia        TEXT NOT NULL CHECK (frecuencia IN ('diario', 'semanal', 'mensual')) DEFAULT 'diario',
  dia_semana        SMALLINT CHECK (dia_semana BETWEEN 0 AND 6), -- solo si frecuencia='semanal'
  dia_mes           SMALLINT CHECK (dia_mes BETWEEN 1 AND 28),   -- solo si frecuencia='mensual'
  periodo           TEXT NOT NULL CHECK (periodo IN ('hoy', 'semana', 'mes', 'trimestre', 'anio')) DEFAULT 'hoy',
  modo_gerencia     TEXT NOT NULL CHECK (modo_gerencia IN ('general', 'por_usuario')) DEFAULT 'general', -- solo aplica si usuario_id es gerencia/dueño
  activo            BOOLEAN NOT NULL DEFAULT true,
  ultima_ejecucion_fecha DATE, -- fecha (America/Bogota) de la última vez que se envió, evita doble envío el mismo día
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (canal_correo OR canal_whatsapp)
);

CREATE INDEX IF NOT EXISTS idx_reportes_programados_usuario ON reportes_programados(usuario_id);
CREATE INDEX IF NOT EXISTS idx_reportes_programados_tenant ON reportes_programados(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reportes_programados_activos ON reportes_programados(activo) WHERE activo = true;

ALTER TABLE reportes_programados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reportes_programados_rls" ON reportes_programados;
CREATE POLICY "reportes_programados_rls" ON reportes_programados
  FOR ALL USING (
    tenant_id = get_user_tenant_id()
    AND (usuario_id = auth.uid() OR get_user_role() IN ('gerencia', 'dueno', 'control_total', 'admin'))
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND (usuario_id = auth.uid() OR get_user_role() IN ('gerencia', 'dueno', 'control_total', 'admin'))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reportes_programados TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reportes_programados TO service_role;
