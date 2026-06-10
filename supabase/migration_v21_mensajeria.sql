-- ============================================================
-- MIGRACIÓN v21 — Módulo de Mensajería OptiDesk
-- Ejecutar en Supabase SQL Editor → Run (una sola vez)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1. EXTENDER tabla clientes (canales de contacto)
-- ------------------------------------------------------------
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS whatsapp_number    text,
  ADD COLUMN IF NOT EXISTS messenger_id       text,
  ADD COLUMN IF NOT EXISTS instagram_id       text,
  ADD COLUMN IF NOT EXISTS lead_source        text CHECK (lead_source IN (
    'concesionario','evento','referido','frio','redes_sociales'
  )),
  ADD COLUMN IF NOT EXISTS assigned_to        uuid REFERENCES usuarios(id);

-- ------------------------------------------------------------
-- 2. CONFIG META — credenciales por tenant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_meta (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  wa_phone_number_id        text,
  wa_phone_number           text,
  wa_business_account_id    text,
  wa_access_token_enc       text,

  messenger_page_id         text,
  messenger_access_token_enc text,

  instagram_account_id      text,
  instagram_access_token_enc text,

  meta_app_id               text,
  meta_app_secret_enc       text,
  meta_webhook_verify_token text,

  negocio_verificado        boolean DEFAULT false,
  estado_wa                 text DEFAULT 'desconectado'
                              CHECK (estado_wa IN ('desconectado','conectando','conectado','error')),
  estado_messenger          text DEFAULT 'desconectado'
                              CHECK (estado_messenger IN ('desconectado','conectando','conectado','error')),
  estado_instagram          text DEFAULT 'desconectado'
                              CHECK (estado_instagram IN ('desconectado','conectando','conectado','error')),

  limite_diario_wa          integer DEFAULT 250,
  mensajes_iniciados_hoy    integer DEFAULT 0,
  limite_reset_at           timestamptz DEFAULT now(),

  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),

  UNIQUE(tenant_id)
);

-- ------------------------------------------------------------
-- 3. CONFIG MENSAJERÍA — ajustes operativos por tenant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config_mensajeria (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  asignacion_automatica       boolean DEFAULT true,
  round_robin_balanceado      boolean DEFAULT true,
  retener_cliente_asesor      boolean DEFAULT true,
  permitir_reasignacion       boolean DEFAULT true,

  dias_retencion              integer DEFAULT 30 CHECK (dias_retencion IN (15, 30, 60)),
  purga_automatica            boolean DEFAULT true,
  resumen_antes_purga         boolean DEFAULT false,

  notificar_asignacion        boolean DEFAULT true,

  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),

  UNIQUE(tenant_id)
);

-- ------------------------------------------------------------
-- 4. CONVERSACIONES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversaciones (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id                  uuid REFERENCES clientes(id),
  assigned_to                 uuid REFERENCES usuarios(id),

  canal                       text NOT NULL CHECK (canal IN ('whatsapp','messenger','instagram','manual')),
  canal_contact_id            text NOT NULL,
  canal_numero_wa             text,
  meta_conversation_id        text,

  estado                      text DEFAULT 'abierta'
                                CHECK (estado IN ('abierta','pendiente','resuelta','archivada')),
  etapa_venta                 text DEFAULT 'nuevo'
                                CHECK (etapa_venta IN (
                                  'nuevo','calificado','demo','propuesta',
                                  'negociacion','ganado','perdido'
                                )),
  prioridad                   text DEFAULT 'normal'
                                CHECK (prioridad IN ('normal','importante','urgente')),

  ultimo_mensaje_at           timestamptz,
  ultimo_mensaje_texto        text,
  ultimo_mensaje_direccion    text CHECK (ultimo_mensaje_direccion IN ('entrante','saliente')),
  no_leidos_count             integer DEFAULT 0,
  sin_respuesta_asesor_desde  timestamptz,

  resumen_ia                  text,
  resumen_actualizado_at      timestamptz,

  asignacion_modo             text DEFAULT 'auto' CHECK (asignacion_modo IN ('auto','manual')),
  asesor_anterior_id          uuid REFERENCES usuarios(id),

  lead_source                 text CHECK (lead_source IN (
    'concesionario','evento','referido','frio','redes_sociales'
  )),

  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_tenant_estado      ON conversaciones(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_conv_assigned           ON conversaciones(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conv_canal_contact      ON conversaciones(canal, canal_contact_id);
CREATE INDEX IF NOT EXISTS idx_conv_ultimo_mensaje     ON conversaciones(tenant_id, ultimo_mensaje_at DESC);

-- ------------------------------------------------------------
-- 5. MENSAJES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensajes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id       uuid NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  tenant_id             uuid NOT NULL REFERENCES tenants(id),

  direccion             text NOT NULL CHECK (direccion IN ('entrante','saliente')),
  tipo                  text NOT NULL DEFAULT 'texto'
                          CHECK (tipo IN ('texto','imagen','documento','audio','video','nota_interna')),
  contenido             text,
  media_url             text,
  media_mime_type       text,

  enviado_por           uuid REFERENCES usuarios(id),
  meta_message_id       text UNIQUE,

  estado_envio          text DEFAULT 'enviado'
                          CHECK (estado_envio IN ('pendiente','enviado','entregado','leido','fallido')),
  error_detalle         text,
  leido_por_asesor      boolean DEFAULT false,

  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_conversacion ON mensajes(conversacion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_no_leidos    ON mensajes(conversacion_id, leido_por_asesor) WHERE leido_por_asesor = false;
CREATE INDEX IF NOT EXISTS idx_msg_created_at   ON mensajes(tenant_id, created_at DESC);

-- Función de purga automática
CREATE OR REPLACE FUNCTION purgar_mensajes_viejos()
RETURNS void AS $$
DECLARE cfg RECORD;
BEGIN
  FOR cfg IN SELECT tenant_id, dias_retencion FROM config_mensajeria WHERE purga_automatica = true LOOP
    DELETE FROM mensajes
    WHERE tenant_id = cfg.tenant_id
      AND created_at < NOW() - (cfg.dias_retencion || ' days')::interval
      AND tipo != 'nota_interna';
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 6. PLANTILLAS DE MENSAJES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantillas_mensajes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  nombre                text NOT NULL,
  categoria             text NOT NULL CHECK (categoria IN (
    'seguimiento_ventas','post_visita','servicio_tecnico',
    'referidos','bienvenida','recordatorio','reactivacion','otro'
  )),

  cuerpo                text NOT NULL,
  variables             text[] DEFAULT '{}',
  ejemplo_renderizado   text,

  meta_template_name    text,
  meta_template_id      text,
  meta_status           text DEFAULT 'borrador'
                          CHECK (meta_status IN ('borrador','enviada_a_meta','aprobada','rechazada')),
  meta_rechazo_motivo   text,

  tipo_header           text CHECK (tipo_header IN ('texto','imagen','documento','ninguno')),
  header_texto          text,
  footer_texto          text,

  activa                boolean DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 7. CAMPAÑAS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campanas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre                text NOT NULL,
  plataforma            text NOT NULL CHECK (plataforma IN ('facebook','instagram','tiktok','google','manual')),
  campaign_id_ext       text,
  adset_id_ext          text,
  ad_id_ext             text,
  form_id_ext           text,
  assigned_to           uuid REFERENCES usuarios(id),
  tipo_asignacion       text DEFAULT 'round_robin' CHECK (tipo_asignacion IN ('usuario_fijo','round_robin')),
  mensaje_bienvenida    text,
  activa                boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 8. REGLAS DE ASIGNACIÓN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reglas_asignacion (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre                text NOT NULL,
  condicion_tipo        text NOT NULL CHECK (condicion_tipo IN (
    'canal','campana','numero_wa','cliente_existente','siempre'
  )),
  condicion_valor       text,
  tipo_asignacion       text NOT NULL CHECK (tipo_asignacion IN ('usuario_fijo','round_robin')),
  asignar_a             uuid REFERENCES usuarios(id),
  mensaje_automatico    text,
  prioridad_regla       integer DEFAULT 10,
  activa                boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reglas_tenant ON reglas_asignacion(tenant_id, activa, prioridad_regla);

-- ------------------------------------------------------------
-- 9. ETIQUETAS DE CONVERSACIÓN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etiquetas_conv (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversacion_id       uuid NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  etiqueta              text NOT NULL,
  color                 text DEFAULT '#6366f1',
  created_at            timestamptz DEFAULT now(),
  UNIQUE(conversacion_id, etiqueta)
);

-- ------------------------------------------------------------
-- 10. FLUJOS DE AUTOMATIZACIÓN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flujos_automatizacion (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre                text NOT NULL,
  descripcion           text,
  trigger_tipo          text NOT NULL CHECK (trigger_tipo IN (
    'mensaje_nuevo','lead_ad','comentario_post','sin_respuesta_24h'
  )),
  nodos                 jsonb NOT NULL DEFAULT '[]',
  activo                boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads_campana (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id       uuid NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  campana_id            uuid REFERENCES campanas(id),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  utm_source            text, utm_medium text, utm_campaign text,
  utm_content           text, utm_term   text,
  ad_id_ext             text, adset_id_ext text, campaign_id_ext text,
  placement             text, form_id_ext text, form_data jsonb,
  created_at            timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 11. RLS — Row Level Security
-- ------------------------------------------------------------
ALTER TABLE config_meta          ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_mensajeria    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas_mensajes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reglas_asignacion    ENABLE ROW LEVEL SECURITY;
ALTER TABLE flujos_automatizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_campana        ENABLE ROW LEVEL SECURITY;
ALTER TABLE etiquetas_conv       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_config_meta"
  ON config_meta FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_config_mensajeria"
  ON config_mensajeria FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_conversaciones"
  ON conversaciones FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_mensajes"
  ON mensajes FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_plantillas"
  ON plantillas_mensajes FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_campanas"
  ON campanas FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_reglas"
  ON reglas_asignacion FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_flujos"
  ON flujos_automatizacion FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_leads_campana"
  ON leads_campana FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_etiquetas"
  ON etiquetas_conv FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM usuarios WHERE id = auth.uid())
  );

-- ============================================================
-- FIN DE MIGRACIÓN v21
-- Ejecutar COMPLETO en Supabase SQL Editor → Run
-- ============================================================
