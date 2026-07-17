-- ══════════════════════════════════════════════════════════════════════════════
-- Migration v83: Permisos de automatización + dedup de mensajes
-- ──────────────────────────────────────────────────────────────────────────────
-- PROBLEMA 1: service_role no tiene acceso a flujo_ejecuciones
--   → La automatización falla silenciosamente con error 42501 (permission denied)
--   → El webhook llama iniciarFlujoParaConversacion() → falla → catch() lo ignora
--
-- PROBLEMA 2: race condition en mensajes duplicados
--   → Dos llamadas al webhook llegan casi simultáneas
--   → Ambas pasan el check SELECT (ninguna ve el insert de la otra aún)
--   → Ambas insertan → dos mensajes con distinto UUID pero mismo meta_message_id
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Grants para service_role en todas las tablas de flujos ────────────────
GRANT ALL ON public.flujo_ejecuciones TO service_role;
GRANT ALL ON public.flujos_automatizacion TO service_role;

-- También para anon y authenticated por si el frontend las usa
GRANT SELECT ON public.flujo_ejecuciones TO authenticated;
GRANT SELECT ON public.flujos_automatizacion TO authenticated;

-- Secuencias asociadas (si las tablas usan serial/bigserial)
-- (UUIDs no tienen secuencia, pero por si acaso)
DO $$
DECLARE
  seq_name text;
BEGIN
  FOR seq_name IN
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema = 'public'
      AND sequence_name LIKE 'flujo_%'
  LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO service_role', seq_name);
  END LOOP;
END $$;

-- ─── 2. UNIQUE constraint en mensajes.meta_message_id para evitar duplicados ──
-- La columna puede ser NULL (mensajes manuales sin meta_message_id),
-- y NULL no viola UNIQUE, así que es seguro.
ALTER TABLE mensajes
  ADD CONSTRAINT mensajes_meta_message_id_unique
  UNIQUE (meta_message_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (ejecutar por separado):
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_name = 'flujo_ejecuciones';
--
-- SELECT indexname FROM pg_indexes WHERE tablename='mensajes' AND indexname LIKE '%meta%';
-- ══════════════════════════════════════════════════════════════════════════════
