-- v89: manuales_config column on tenants for storing R2 keys per section

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS manuales_config JSONB DEFAULT '{}'::jsonb;
