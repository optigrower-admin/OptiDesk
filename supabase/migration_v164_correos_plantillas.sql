-- Amplía plantillas_correo (ya existía, sin uso real en la app hasta ahora)
-- con destinatario fijo y documentos a adjuntar, y agrega correos_cliente
-- como historial real de correos enviados por cliente (nueva pestaña "Correos").

ALTER TABLE plantillas_correo ADD COLUMN IF NOT EXISTS destinatario text;
ALTER TABLE plantillas_correo ADD COLUMN IF NOT EXISTS documentos_adjuntos text[] DEFAULT '{}';
ALTER TABLE plantillas_correo ADD COLUMN IF NOT EXISTS orden integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS correos_cliente (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plantilla_id    uuid REFERENCES plantillas_correo(id) ON DELETE SET NULL,
  plantilla_nombre text,
  destinatario    text NOT NULL,
  asunto          text NOT NULL,
  cuerpo          text NOT NULL,
  adjuntos        text[] DEFAULT '{}',
  enviado_por     uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  estado          text NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado','error')),
  error_mensaje   text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correos_cliente_cliente ON correos_cliente(cliente_id, created_at DESC);

ALTER TABLE correos_cliente ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='correos_cliente' AND policyname='tenant_isolation_correos_cliente') THEN
    CREATE POLICY "tenant_isolation_correos_cliente" ON correos_cliente FOR ALL
      USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.correos_cliente TO authenticated;
