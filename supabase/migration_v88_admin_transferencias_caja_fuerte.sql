-- ============================================================
-- V88: Admin puede transferir hacia/desde Caja fuerte
--
-- ajustes_caja es la tabla que registra movimientos en Caja fuerte.
-- La política de INSERT solo permitía gerencia/control_total, lo que
-- bloqueaba a admin al intentar transferir a/desde caja fuerte.
-- El botón "+ Ajuste" sigue siendo exclusivo de Gerencia (UI).
-- ============================================================

DROP POLICY IF EXISTS "gerencia_insert_ajustes_caja" ON public.ajustes_caja;

CREATE POLICY "gerencia_admin_insert_ajustes_caja" ON public.ajustes_caja
  FOR INSERT WITH CHECK (
    get_user_role() IN ('gerencia', 'admin', 'control_total')
    AND tenant_id = get_user_tenant_id()
  );
