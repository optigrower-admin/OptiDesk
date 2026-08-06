-- v153: categorias_servicio y subcategorias_servicio nunca tuvieron GRANT
-- para service_role, así que cualquier consulta admin (ej. el reporte de
-- Servicio Técnico) que hace join con categorias_servicio(nombre) fallaba
-- en silencio con "permission denied for table categorias_servicio",
-- dejando el reporte vacío.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categorias_servicio TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subcategorias_servicio TO service_role;
