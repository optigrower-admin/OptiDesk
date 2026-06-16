-- Migration v30: Corregir RLS de pagos_orden
-- La política de v19 usaba un subquery directo contra "usuarios" en vez de las
-- funciones SECURITY DEFINER get_user_role()/get_user_tenant_id() que usa el
-- resto del esquema desde v5. Eso la deja inconsistente con todas las demás
-- tablas y es la causa más probable de que el rol "admin" no vea ni pueda
-- registrar pagos en pagos_orden mientras "gerencia" sí puede.
-- Ejecutar en Supabase → SQL Editor

DROP POLICY IF EXISTS "tenant_access_pagos_orden" ON pagos_orden;

CREATE POLICY "control_total_all_pagos_orden" ON pagos_orden
  FOR ALL USING (get_user_role() = 'control_total');

CREATE POLICY "tenant_access_pagos_orden" ON pagos_orden
  FOR ALL USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());
