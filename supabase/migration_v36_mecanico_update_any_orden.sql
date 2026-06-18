-- Migration v36: Permitir que cualquier mecánico del taller edite cualquier
-- orden de su tenant, no solo la que tiene asignada (mecanico_id = auth.uid()).
--
-- Causa del bug reportado: la política original "mecanico_update_own_ordenes"
-- (schema.sql) sólo permite UPDATE si la orden está asignada a ese mecánico.
-- Si un mecánico distinto al asignado (o sin asignar) intentaba corregir la
-- placa u otro campo, RLS bloqueaba el UPDATE silenciosamente — Postgres no
-- lanza error, simplemente afecta 0 filas, así que en la app no se veía
-- ningún mensaje de error: el campo "se quedaba tal y como estaba".
--
-- Ejecutar en Supabase → SQL Editor

DROP POLICY IF EXISTS "mecanico_update_own_ordenes" ON ordenes;

CREATE POLICY "mecanico_update_ordenes" ON ordenes
  FOR UPDATE USING (get_user_role() = 'mecanico' AND tenant_id = get_user_tenant_id())
  WITH CHECK (get_user_role() = 'mecanico' AND tenant_id = get_user_tenant_id());
