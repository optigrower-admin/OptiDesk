-- ══════════════════════════════════════════════════════════════════════════════
-- Migration v80: Habilitar Supabase Realtime en `clientes`
-- ──────────────────────────────────────────────────────────────────────────────
-- Sin esto, el kanban de Seguimiento de Ventas NO se actualiza automáticamente
-- cuando el webhook de WhatsApp recibe un nuevo mensaje y pone al cliente en
-- "Nuevo Contacto - Mensaje". El usuario tendría que refrescar la página a mano.
--
-- REPLICA IDENTITY FULL es necesario para que Supabase Realtime incluya el
-- estado anterior (old) de la fila en los eventos UPDATE, lo que permite al
-- frontend filtrar eventos relevantes (ej: en_seguimiento_ventas cambió).
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Permitir que Supabase Realtime incluya valores anteriores en UPDATE/DELETE
ALTER TABLE clientes REPLICA IDENTITY FULL;

-- 2. Agregar la tabla a la publicación de Realtime (si no está ya)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clientes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE clientes;
  END IF;
END $$;

-- Verificación rápida (debe mostrar clientes en la lista):
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
