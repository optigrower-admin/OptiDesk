-- ============================================================
-- MIGRACIÓN v45 — Permitir eliminar repuestos del catálogo
-- Externos/Propios, exclusivo de Gerencia
--
-- repuestos_externos solo tenía políticas de SELECT, INSERT y
-- UPDATE (admin) — faltaba DELETE por completo, así que ningún
-- rol podía borrar filas de este catálogo bajo RLS.
-- ============================================================

CREATE POLICY "gerencia_delete_repuestos_ext" ON repuestos_externos
FOR DELETE USING (get_user_role() = 'gerencia' AND tenant_id = get_user_tenant_id());

-- ============================================================
-- FIN MIGRACIÓN v45
-- ============================================================
