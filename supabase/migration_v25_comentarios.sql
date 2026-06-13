-- ── Publicaciones de Facebook/Instagram ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS publicaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  canal          text NOT NULL CHECK (canal IN ('facebook', 'instagram')),
  publicacion_id text NOT NULL,
  caption        text,
  media_url      text,
  media_type     text,
  permalink      text,
  comentarios_count int NOT NULL DEFAULT 0,
  synced_at      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, publicacion_id)
);

ALTER TABLE publicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_publicaciones" ON publicaciones FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

-- ── Comentarios de publicaciones ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comentarios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  publicacion_id       uuid NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  canal                text NOT NULL CHECK (canal IN ('facebook', 'instagram')),
  comentario_id        text NOT NULL,
  texto                text,
  autor_id             text,
  autor_nombre         text,
  autor_username       text,
  autor_foto           text,
  estado               text NOT NULL DEFAULT 'nuevo'
                         CHECK (estado IN ('nuevo', 'visto', 'respondido', 'dm_enviado')),
  es_respuesta         boolean NOT NULL DEFAULT false,
  parent_comentario_id text,
  conversacion_id      uuid REFERENCES conversaciones(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, comentario_id)
);

ALTER TABLE comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_comentarios" ON comentarios FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

-- Realtime: necesario para el badge en tiempo real del nav
ALTER TABLE comentarios REPLICA IDENTITY FULL;
ALTER publication supabase_realtime ADD TABLE comentarios;

-- Service role puede leer/escribir sin RLS (para el webhook processor)
GRANT ALL ON publicaciones TO service_role;
GRANT ALL ON comentarios   TO service_role;
