-- ============================================================
-- MIGRACIÓN v41 — Tipo de documento del cliente
-- Ejecutar DESPUÉS de migration_v40_conectar_correo_personal.sql
-- El número de documento se sigue guardando en la columna `cedula`
-- (ya existente desde v2) — esta migración solo agrega el tipo.
-- ============================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS tipo_documento text DEFAULT 'CC'
    CHECK (tipo_documento IN ('CC','TI','CE','PASAPORTE','NIT','RC','PEP'));

-- ============================================================
-- FIN MIGRACIÓN v41
-- ============================================================
