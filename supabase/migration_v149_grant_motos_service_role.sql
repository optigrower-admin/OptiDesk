-- v149: a la tabla motos le faltaba el GRANT a service_role (mismo patrón de
-- bug recurrente ya visto con bonos/clientes_bonos/agentes_ia/etc. este
-- año) — bloquea cualquier acceso admin-side (cron, scripts, diagnóstico) a
-- esta tabla con error 42501 "permission denied for table motos".
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.motos TO service_role;
