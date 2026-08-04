-- v138: a las tablas bonos/clientes_bonos (creadas en v113) nunca se les dio
-- GRANT para service_role — mismo bug recurrente ya visto en medios/agentes_ia.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bonos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clientes_bonos TO service_role;
