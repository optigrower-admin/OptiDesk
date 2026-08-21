-- Sección "Objeciones comunes" en Editar agente: lista de {objecion, respuesta}
-- que se agrega al prompt del agente como guía de manejo de objeciones.
ALTER TABLE agentes_ia ADD COLUMN IF NOT EXISTS objeciones jsonb DEFAULT '[]'::jsonb;

-- Sugerencias que produce el análisis de conversaciones (ver
-- /api/admin/agentes-ia/[id]/analizar) — quedan pendientes de revisión de
-- gerencia, nunca se aplican solas al agente.
CREATE TABLE IF NOT EXISTS agente_sugerencias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agente_id     uuid NOT NULL REFERENCES agentes_ia(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('objecion', 'proceso')),
  objecion      text,
  respuesta     text,
  motivo        text,
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aplicada', 'descartada')),
  conversaciones_analizadas integer DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agente_sugerencias_agente ON agente_sugerencias(agente_id, estado);

ALTER TABLE agente_sugerencias ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agente_sugerencias' AND policyname='tenant_isolation_agente_sugerencias') THEN
    CREATE POLICY "tenant_isolation_agente_sugerencias" ON agente_sugerencias FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agente_sugerencias TO authenticated;
