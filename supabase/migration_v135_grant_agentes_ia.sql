-- v135: La tabla `agentes_ia` (creada en v78, antes de esta sesión) nunca
-- tuvo GRANT para `service_role` ni `authenticated` — el mismo problema que
-- se encontró y corrigió para `medios` en v133. Sin esto, cualquier consulta
-- desde el cliente admin (usado por /api/admin/agentes-ia) fallaba con
-- "permission denied for table agentes_ia", dejando la pantalla de Agentes
-- IA vacía y sin el botón de crear (aunque el rol sí tuviera permiso).

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agentes_ia TO service_role;
GRANT SELECT ON TABLE public.agentes_ia TO authenticated;
