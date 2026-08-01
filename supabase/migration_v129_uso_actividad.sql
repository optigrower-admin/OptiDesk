-- v129: Uso y actividad de OptiDesk por usuario.
--
-- Complementa lo que ya existía (no lo duplica):
--   - "Acciones realizadas"    → se cuenta desde la tabla `auditoria` ya existente.
--   - "Almacenamiento usado"   → se suma `tamano_bytes` de `medios` y `archivos_cliente`
--                                agrupado por `subido_por` (ya existían esas columnas).
--   - "Tiempo activo" y "presencia en vivo" y "páginas más visitadas" → tablas
--     nuevas de este archivo, alimentadas por un heartbeat del navegador cada
--     ~20s mientras el usuario tiene OptiDesk abierto.

-- ─── Presencia en vivo (1 fila por usuario, se sobreescribe en cada heartbeat) ─
CREATE TABLE IF NOT EXISTS usuarios_presencia (
  usuario_id          UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  activo              BOOLEAN NOT NULL DEFAULT false,
  pagina_actual       TEXT,
  ultimo_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usuarios_presencia_tenant ON usuarios_presencia(tenant_id);
ALTER TABLE usuarios_presencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_presencia_tenant_select" ON usuarios_presencia;
CREATE POLICY "usuarios_presencia_tenant_select" ON usuarios_presencia
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
GRANT SELECT ON TABLE public.usuarios_presencia TO authenticated;
GRANT ALL ON TABLE public.usuarios_presencia TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'usuarios_presencia') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE usuarios_presencia;
  END IF;
END $$;

-- ─── Tiempo activo acumulado por día (para sumar por semana) ──────────────────
CREATE TABLE IF NOT EXISTS uso_tiempo_diario (
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  segundos_activo INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_uso_tiempo_diario_tenant_fecha ON uso_tiempo_diario(tenant_id, fecha);
ALTER TABLE uso_tiempo_diario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uso_tiempo_diario_tenant_select" ON uso_tiempo_diario;
CREATE POLICY "uso_tiempo_diario_tenant_select" ON uso_tiempo_diario
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
GRANT SELECT ON TABLE public.uso_tiempo_diario TO authenticated;
GRANT ALL ON TABLE public.uso_tiempo_diario TO service_role;

-- ─── Registro de navegación (para "páginas más visitadas") ────────────────────
CREATE TABLE IF NOT EXISTS uso_navegacion (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seccion     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uso_navegacion_tenant_usuario_fecha ON uso_navegacion(tenant_id, usuario_id, created_at DESC);
ALTER TABLE uso_navegacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "uso_navegacion_tenant_select" ON uso_navegacion;
CREATE POLICY "uso_navegacion_tenant_select" ON uso_navegacion
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
GRANT SELECT ON TABLE public.uso_navegacion TO authenticated;
GRANT ALL ON TABLE public.uso_navegacion TO service_role;
