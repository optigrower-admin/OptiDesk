-- v133: A la tabla `medios` nunca se le otorgó GRANT de UPDATE (ni SELECT
-- explícito) al rol `service_role` — el cliente admin (createAdminClient(),
-- usado por /api/admin/migrar-a-drive y otras rutas) hace bypass de RLS pero
-- SIGUE necesitando el GRANT a nivel de tabla de Postgres. Sin esto, cualquier
-- UPDATE a `medios` desde el service role fallaba con:
--   "permission denied for table medios" (código 42501)
-- Esto probablemente afectaba tanto la migración a Drive por lote (ya
-- existente) como la migración de un archivo puntual (nueva).

GRANT SELECT, UPDATE ON TABLE public.medios TO service_role;
