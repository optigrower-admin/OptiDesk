-- ============================================================
-- V93: Correo de la empresa (una sola cuenta Gmail por tenant)
-- Usado para enviar el resumen diario a todos los colaboradores,
-- sin que cada uno tenga que conectar su propio Gmail.
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS email_empresa_smtp_usuario         TEXT,
  ADD COLUMN IF NOT EXISTS email_empresa_smtp_app_password_enc TEXT,
  ADD COLUMN IF NOT EXISTS email_empresa_conectado_at          TIMESTAMPTZ;
