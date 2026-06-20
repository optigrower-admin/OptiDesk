-- ============================================================
-- MIGRACIÓN v40 — Cada usuario conecta su propio correo (Gmail)
-- para enviar recordatorios/plantillas desde Seguimiento Ventas.
-- Ejecutar DESPUÉS de migration_v39_seguimiento_ventas.sql
-- ============================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS email_smtp_usuario        text,
  ADD COLUMN IF NOT EXISTS email_smtp_app_password_enc text,
  ADD COLUMN IF NOT EXISTS email_conectado_at         timestamptz;

-- ============================================================
-- FIN MIGRACIÓN v40
-- ============================================================
