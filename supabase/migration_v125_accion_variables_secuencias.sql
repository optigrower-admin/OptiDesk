-- v125: soporte para el nodo unificado "Acción" del constructor de Flujos —
-- catálogo de variables por flujo (nombre + tipo), eventos personalizados,
-- opt-in/out de transmisiones, y secuencias de mensajes (goteo básico).

ALTER TABLE flujos_automatizacion
  ADD COLUMN IF NOT EXISTS variables_definidas JSONB NOT NULL DEFAULT '[]';

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS recibe_transmisiones BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS eventos_personalizados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  conversacion_id UUID REFERENCES conversaciones(id) ON DELETE SET NULL,
  nombre_evento   TEXT NOT NULL,
  datos           JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_personalizados_tenant_fecha ON eventos_personalizados(tenant_id, created_at DESC);
ALTER TABLE eventos_personalizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eventos_personalizados_tenant" ON eventos_personalizados
  FOR SELECT USING (tenant_id = get_user_tenant_id());
GRANT SELECT ON TABLE public.eventos_personalizados TO authenticated;
GRANT ALL ON TABLE public.eventos_personalizados TO service_role;

CREATE TABLE IF NOT EXISTS secuencias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  activa      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE secuencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "secuencias_tenant_all" ON secuencias
  FOR ALL USING (tenant_id = get_user_tenant_id()) WITH CHECK (tenant_id = get_user_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.secuencias TO authenticated;
GRANT ALL ON TABLE public.secuencias TO service_role;

CREATE TABLE IF NOT EXISTS secuencia_mensajes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secuencia_id   UUID NOT NULL REFERENCES secuencias(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  orden          INTEGER NOT NULL DEFAULT 0,
  contenido      TEXT NOT NULL,
  dias_despues   NUMERIC NOT NULL DEFAULT 0  -- días desde el paso anterior (0 = inmediato al suscribirse)
);
CREATE INDEX IF NOT EXISTS idx_secuencia_mensajes_secuencia ON secuencia_mensajes(secuencia_id, orden);
ALTER TABLE secuencia_mensajes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "secuencia_mensajes_tenant_all" ON secuencia_mensajes
  FOR ALL USING (tenant_id = get_user_tenant_id()) WITH CHECK (tenant_id = get_user_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.secuencia_mensajes TO authenticated;
GRANT ALL ON TABLE public.secuencia_mensajes TO service_role;

CREATE TABLE IF NOT EXISTS secuencia_suscripciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secuencia_id        UUID NOT NULL REFERENCES secuencias(id) ON DELETE CASCADE,
  cliente_id          UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  conversacion_id     UUID REFERENCES conversaciones(id) ON DELETE SET NULL,
  activa              BOOLEAN NOT NULL DEFAULT true,
  paso_actual         INTEGER NOT NULL DEFAULT 0,
  proxima_ejecucion_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_secuencia_suscripciones_unica ON secuencia_suscripciones(secuencia_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_secuencia_suscripciones_pendientes ON secuencia_suscripciones(activa, proxima_ejecucion_at);
ALTER TABLE secuencia_suscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "secuencia_suscripciones_tenant" ON secuencia_suscripciones
  FOR SELECT USING (tenant_id = get_user_tenant_id());
GRANT SELECT ON TABLE public.secuencia_suscripciones TO authenticated;
GRANT ALL ON TABLE public.secuencia_suscripciones TO service_role;
