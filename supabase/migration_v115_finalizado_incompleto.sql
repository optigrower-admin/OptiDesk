-- v115: Estado "Finalizado - Incompleto" en Servicio Técnico
--
-- Sub-estado de "Finalizado" que solo Gerencia puede marcar, exige una nota
-- obligatoria del motivo y, mientras esté activo, bloquea la orden a modo
-- solo-lectura para todos los demás roles (mecánico, admin) — solo Gerencia
-- y control_total pueden seguir editando. El bloqueo se aplica tanto en la
-- app (cliente) como aquí en RLS, para que ningún rol pueda saltárselo.

ALTER TABLE ordenes DROP CONSTRAINT IF EXISTS ordenes_estado_check;
ALTER TABLE ordenes ADD CONSTRAINT ordenes_estado_check
  CHECK (estado IN ('programado', 'falta_revision', 'en_proceso', 'pendiente', 'pagado', 'listo', 'finalizado_incompleto'));

ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS nota_finalizado_incompleto TEXT;

-- Función auxiliar: ¿se puede modificar esta orden? Sí, si el rol es
-- gerencia/control_total, o si la orden NO está en finalizado_incompleto.
CREATE OR REPLACE FUNCTION orden_es_editable(p_orden_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT get_user_role() IN ('gerencia', 'control_total')
    OR NOT EXISTS (
      SELECT 1 FROM ordenes WHERE id = p_orden_id AND estado = 'finalizado_incompleto'
    );
$$;

-- ── ORDENES ──
DROP POLICY IF EXISTS "mecanico_update_ordenes" ON ordenes;
CREATE POLICY "mecanico_update_ordenes" ON ordenes
  FOR UPDATE USING (get_user_role() = 'mecanico' AND tenant_id = get_user_tenant_id() AND orden_es_editable(id))
  WITH CHECK (get_user_role() = 'mecanico' AND tenant_id = get_user_tenant_id() AND orden_es_editable(id));

DROP POLICY IF EXISTS "admin_crud_ordenes" ON ordenes;
CREATE POLICY "admin_crud_ordenes" ON ordenes
  FOR ALL USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id() AND orden_es_editable(id));

-- ── ITEMS_ORDEN ──
DROP POLICY IF EXISTS "tenant_insert_items" ON items_orden;
CREATE POLICY "tenant_insert_items" ON items_orden
  FOR INSERT WITH CHECK (
    orden_id IN (SELECT id FROM ordenes WHERE tenant_id = get_user_tenant_id())
    AND orden_es_editable(orden_id)
  );

DROP POLICY IF EXISTS "admin_update_items" ON items_orden;
CREATE POLICY "admin_update_items" ON items_orden
  FOR UPDATE USING (
    get_user_role() IN ('admin', 'gerencia') AND
    orden_id IN (SELECT id FROM ordenes WHERE tenant_id = get_user_tenant_id()) AND
    orden_es_editable(orden_id)
  );

DROP POLICY IF EXISTS "admin_delete_items" ON items_orden;
CREATE POLICY "admin_delete_items" ON items_orden
  FOR DELETE USING (
    get_user_role() IN ('admin', 'gerencia') AND
    orden_id IN (SELECT id FROM ordenes WHERE tenant_id = get_user_tenant_id()) AND
    orden_es_editable(orden_id)
  );

-- ── MEDIOS ──
DROP POLICY IF EXISTS "tenant_insert_medios" ON medios;
CREATE POLICY "tenant_insert_medios" ON medios
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND orden_es_editable(orden_id));

DROP POLICY IF EXISTS "mecanico_delete_own_medios" ON medios;
CREATE POLICY "mecanico_delete_own_medios" ON medios
  FOR DELETE USING (subido_por = auth.uid() AND orden_es_editable(orden_id));

DROP POLICY IF EXISTS "admin_delete_medios" ON medios;
CREATE POLICY "admin_delete_medios" ON medios
  FOR DELETE USING (get_user_role() IN ('admin', 'gerencia') AND tenant_id = get_user_tenant_id() AND orden_es_editable(orden_id));

-- ── PAGOS_ORDEN ──
-- Se separa lectura (siempre permitida) de escritura (bloqueada si la orden
-- quedó en finalizado_incompleto), para que el bloqueo no oculte el historial.
DROP POLICY IF EXISTS "tenant_access_pagos_orden" ON pagos_orden;
CREATE POLICY "tenant_select_pagos_orden" ON pagos_orden
  FOR SELECT USING (tenant_id = get_user_tenant_id());
CREATE POLICY "tenant_write_pagos_orden" ON pagos_orden
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id() AND orden_es_editable(orden_id));
CREATE POLICY "tenant_update_pagos_orden" ON pagos_orden
  FOR UPDATE USING (tenant_id = get_user_tenant_id() AND orden_es_editable(orden_id));
CREATE POLICY "tenant_delete_pagos_orden" ON pagos_orden
  FOR DELETE USING (tenant_id = get_user_tenant_id() AND orden_es_editable(orden_id));

-- ── COMENTARIOS_ORDEN ──
DROP POLICY IF EXISTS "tenant_isolation_comentarios_orden" ON comentarios_orden;
CREATE POLICY "tenant_select_comentarios_orden" ON comentarios_orden
  FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "tenant_write_comentarios_orden" ON comentarios_orden
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid())
    AND orden_es_editable(orden_id)
  );
CREATE POLICY "tenant_update_comentarios_orden" ON comentarios_orden
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid())
    AND orden_es_editable(orden_id)
  );
CREATE POLICY "tenant_delete_comentarios_orden" ON comentarios_orden
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid())
    AND orden_es_editable(orden_id)
  );
