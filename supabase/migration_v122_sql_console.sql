-- v122: Consultas SQL — tablas de soporte del módulo
--
-- Este módulo ejecuta SQL de solo lectura contra un rol de Postgres aparte
-- (optidesk_query_readonly, creado en supabase/setup_rol_readonly_sql_console.sql
-- — ESE script hay que correrlo aparte, manualmente, porque crea un ROL de
-- Postgres con contraseña propia, algo que una migración normal no debería
-- hacer). Estas 4 tablas son solo la configuración/bitácora del módulo, viven
-- en el flujo normal de migraciones.

CREATE TABLE IF NOT EXISTS sql_console_permisos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id            UUID REFERENCES usuarios(id) ON DELETE CASCADE, -- NULL = aplica al rol completo
  rol                   TEXT NOT NULL CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'control_total', 'dueno', 'freelancer')),
  puede_acceder         BOOLEAN NOT NULL DEFAULT false,
  tablas_permitidas     JSONB NOT NULL DEFAULT '[]', -- vacío = todas las de la whitelist general
  puede_exportar        BOOLEAN NOT NULL DEFAULT true,
  limite_filas_preview  INTEGER NOT NULL DEFAULT 500,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una fila por rol (default de ese rol) y opcionalmente una fila de excepción por usuario puntual.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sql_console_permisos_rol
  ON sql_console_permisos(tenant_id, rol) WHERE usuario_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sql_console_permisos_usuario
  ON sql_console_permisos(tenant_id, usuario_id) WHERE usuario_id IS NOT NULL;

ALTER TABLE sql_console_permisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sql_console_permisos_gerencia_all" ON sql_console_permisos
  FOR ALL USING (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() IN ('gerencia', 'control_total'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sql_console_permisos TO authenticated;
GRANT ALL ON TABLE public.sql_console_permisos TO service_role;

CREATE TABLE IF NOT EXISTS query_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  query_text        TEXT NOT NULL,
  filas_retornadas  INTEGER,
  duracion_ms       INTEGER,
  status            TEXT NOT NULL CHECK (status IN ('OK', 'ERROR', 'TIMEOUT')),
  error_mensaje     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_history_usuario_fecha ON query_history(tenant_id, usuario_id, created_at DESC);

ALTER TABLE query_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "query_history_propia_o_gerencia" ON query_history
  FOR SELECT USING (
    tenant_id = get_user_tenant_id()
    AND (usuario_id = auth.uid() OR get_user_role() IN ('gerencia', 'control_total'))
  );

GRANT SELECT ON TABLE public.query_history TO authenticated;
GRANT ALL ON TABLE public.query_history TO service_role;

CREATE TABLE IF NOT EXISTS saved_queries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  query_text  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_queries_usuario ON saved_queries(tenant_id, usuario_id, created_at DESC);

ALTER TABLE saved_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_queries_propia" ON saved_queries
  FOR ALL USING (tenant_id = get_user_tenant_id() AND usuario_id = auth.uid())
  WITH CHECK (tenant_id = get_user_tenant_id() AND usuario_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_queries TO authenticated;
GRANT ALL ON TABLE public.saved_queries TO service_role;

CREATE TABLE IF NOT EXISTS export_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  query_text      TEXT NOT NULL,
  formato         TEXT NOT NULL CHECK (formato IN ('csv', 'xlsx', 'json', 'txt')),
  status          TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'PROCESANDO', 'LISTO', 'ERROR')),
  archivo_url     TEXT,
  filas_totales   INTEGER,
  error_mensaje   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completado_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_usuario_fecha ON export_jobs(tenant_id, usuario_id, created_at DESC);

ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "export_jobs_propia_o_gerencia" ON export_jobs
  FOR SELECT USING (
    tenant_id = get_user_tenant_id()
    AND (usuario_id = auth.uid() OR get_user_role() IN ('gerencia', 'control_total'))
  );

GRANT SELECT ON TABLE public.export_jobs TO authenticated;
GRANT ALL ON TABLE public.export_jobs TO service_role;
