-- ============================================================
-- MIGRACIÓN v49 — Corrige el CHECK de ordenes.estado (faltaba 'pagado')
--
-- CAUSA RAÍZ de todo el historial de "el estado Pagado no se guarda":
-- el CHECK original (schema.sql) solo permitía
-- ('falta_revision', 'en_proceso', 'pendiente', 'listo'). El valor
-- 'pagado' se usa en la app (auto-pagado, selector de estado, diálogo
-- de finalizar) desde hace tiempo, pero la base de datos lo rechazaba
-- silenciosamente en cada UPDATE/INSERT — el error solo se hizo visible
-- ahora porque se agregó manejo explícito de errores en el frontend.
-- ============================================================

ALTER TABLE ordenes DROP CONSTRAINT IF EXISTS ordenes_estado_check;
ALTER TABLE ordenes ADD CONSTRAINT ordenes_estado_check
  CHECK (estado IN ('falta_revision', 'en_proceso', 'pendiente', 'pagado', 'listo'));

-- ============================================================
-- FIN MIGRACIÓN v49
-- ============================================================
