-- v131: Agentes IA reutilizables con herramientas (tool-calling).
--
-- Extiende la tabla `agentes_ia` ya existente (v78) en vez de reemplazarla —
-- los agentes creados antes de esta migración siguen funcionando igual
-- (proveedor/modelo/prompt_sistema/instrucciones + config_apis_ia), y ahora
-- opcionalmente pueden apuntar a una integración de `integraciones_ia` (el
-- sistema más nuevo, multi-proveedor) y tener herramientas habilitadas.

ALTER TABLE agentes_ia ADD COLUMN IF NOT EXISTS descripcion TEXT;
ALTER TABLE agentes_ia ADD COLUMN IF NOT EXISTS integracion_ia_id UUID REFERENCES integraciones_ia(id) ON DELETE SET NULL;
ALTER TABLE agentes_ia ADD COLUMN IF NOT EXISTS herramientas_habilitadas JSONB NOT NULL DEFAULT '[]';
ALTER TABLE agentes_ia ADD COLUMN IF NOT EXISTS creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;

-- ─── Log de ejecuciones del agente (auditoría/debug) ──────────────────────────
CREATE TABLE IF NOT EXISTS agente_ejecuciones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agente_id             UUID NOT NULL REFERENCES agentes_ia(id) ON DELETE CASCADE,
  conversacion_id       UUID REFERENCES conversaciones(id) ON DELETE SET NULL,
  mensaje_entrada       TEXT,
  herramienta_invocada  TEXT,
  parametros_herramienta JSONB,
  respuesta_texto       TEXT,
  exitoso               BOOLEAN NOT NULL DEFAULT TRUE,
  error_mensaje         TEXT,
  duracion_ms           INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agente_ejecuciones_agente_fecha ON agente_ejecuciones(agente_id, created_at DESC);
ALTER TABLE agente_ejecuciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agente_ejecuciones_tenant_select" ON agente_ejecuciones;
CREATE POLICY "agente_ejecuciones_tenant_select" ON agente_ejecuciones
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
GRANT SELECT ON TABLE public.agente_ejecuciones TO authenticated;
GRANT ALL ON TABLE public.agente_ejecuciones TO service_role;

-- ─── Memoria del agente por conversación (contexto que no es solo el historial) ─
CREATE TABLE IF NOT EXISTS agente_memoria (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id     UUID NOT NULL REFERENCES agentes_ia(id) ON DELETE CASCADE,
  conversacion_id UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  cliente_id    UUID REFERENCES clientes(id) ON DELETE SET NULL,
  datos         JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agente_id, conversacion_id)
);
CREATE INDEX IF NOT EXISTS idx_agente_memoria_conversacion ON agente_memoria(conversacion_id);
ALTER TABLE agente_memoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agente_memoria_tenant_select" ON agente_memoria;
CREATE POLICY "agente_memoria_tenant_select" ON agente_memoria
  FOR SELECT USING (
    agente_id IN (SELECT id FROM agentes_ia WHERE tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  );
GRANT SELECT ON TABLE public.agente_memoria TO authenticated;
GRANT ALL ON TABLE public.agente_memoria TO service_role;
