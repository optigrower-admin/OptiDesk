-- v23: Agregar service_role a las tablas que el admin client necesita escribir
-- Las tablas de migration_v2 solo tenían grants para authenticated/anon

GRANT SELECT, INSERT, UPDATE, DELETE ON clientes               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversaciones         TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON mensajes               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON config_meta            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON usuarios               TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants                TO service_role;
