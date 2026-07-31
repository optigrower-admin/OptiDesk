-- v117: Envío real a Meta de plantillas de WhatsApp (plantillas_mensajes)
--
-- La tabla plantillas_mensajes (creada en v21) ya soporta el flujo local
-- (nombre, categoría de negocio, cuerpo, header de texto, footer,
-- meta_template_name/id, meta_status). Esta migración la EXTIENDE
-- (no la reemplaza) para poder enviar la plantilla de verdad a la Graph
-- API de Meta: agrega la categoría oficial de Meta (MARKETING/UTILITY/
-- AUTHENTICATION, separada de la categoría de negocio interna que ya
-- existía), idioma, contenido de header para imagen/video/documento,
-- botones, y amplía los estados posibles (pendiente/pausada/deshabilitada)
-- y tipos de header (video) que Meta puede reportar/requerir.

ALTER TABLE plantillas_mensajes DROP CONSTRAINT IF EXISTS plantillas_mensajes_meta_status_check;
ALTER TABLE plantillas_mensajes ADD CONSTRAINT plantillas_mensajes_meta_status_check
  CHECK (meta_status IN ('borrador', 'enviada_a_meta', 'pendiente', 'aprobada', 'rechazada', 'pausada', 'deshabilitada'));

ALTER TABLE plantillas_mensajes DROP CONSTRAINT IF EXISTS plantillas_mensajes_tipo_header_check;
ALTER TABLE plantillas_mensajes ADD CONSTRAINT plantillas_mensajes_tipo_header_check
  CHECK (tipo_header IN ('texto', 'imagen', 'documento', 'video', 'ninguno'));

ALTER TABLE plantillas_mensajes ADD COLUMN IF NOT EXISTS categoria_meta TEXT NOT NULL DEFAULT 'UTILITY'
  CHECK (categoria_meta IN ('MARKETING', 'UTILITY', 'AUTHENTICATION'));

ALTER TABLE plantillas_mensajes ADD COLUMN IF NOT EXISTS idioma TEXT NOT NULL DEFAULT 'es_CO';

ALTER TABLE plantillas_mensajes ADD COLUMN IF NOT EXISTS header_contenido TEXT;

ALTER TABLE plantillas_mensajes ADD COLUMN IF NOT EXISTS botones JSONB NOT NULL DEFAULT '[]';
