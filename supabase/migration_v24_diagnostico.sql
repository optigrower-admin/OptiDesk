-- ============================================================
-- MIGRACIÓN v24 — Diagnóstico + Fix de permisos redundante
-- Ejecutar en Supabase SQL Editor si el nombre no persiste
-- ============================================================

-- 1. Reasegurar los GRANTs de service_role (idempotente)
GRANT SELECT, INSERT, UPDATE, DELETE ON clientes               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversaciones         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON mensajes               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON config_meta            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON usuarios               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants                TO service_role;

-- 2. Verificar que los datos se guardaron correctamente
--    (Ejecuta esto para diagnosticar — no modifica nada)
SELECT
  conv.id                       AS conversacion_id,
  conv.canal_contact_id,
  conv.cliente_id,
  c.nombre                      AS nombre_cliente,
  c.whatsapp_number,
  c.tenant_id                   AS cliente_tenant_id
FROM conversaciones conv
LEFT JOIN clientes c ON c.id = conv.cliente_id
WHERE conv.canal = 'whatsapp'
ORDER BY conv.ultimo_mensaje_at DESC
LIMIT 20;
