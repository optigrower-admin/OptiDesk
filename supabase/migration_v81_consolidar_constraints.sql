-- ══════════════════════════════════════════════════════════════════════════════
-- Migration v81: Consolidar CHECK constraints y columnas en clientes
-- ──────────────────────────────────────────────────────────────────────────────
-- EJECUTAR SI TIENES PROBLEMAS CON:
--   "Client not appearing in Nuevo Contacto - Mensaje"
--   Automation no inicia
--
-- Esta migración es IDEMPOTENTE — se puede correr aunque v74/v75/v77 ya se hayan aplicado.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Actualizar CHECK constraint de etapa_venta con TODOS los valores válidos
--    (combina v39, v70, v71, v74, v75, v77 en uno solo)
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_etapa_venta_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_etapa_venta_check
  CHECK (etapa_venta IN (
    'nuevo_mensaje',
    'nuevo', 'con_interes', 'con_objecion',
    'propuesta', 'demo',
    'seguimiento', 'buscando_credito', 'en_proceso_credito',
    'calificado', 'negociacion',
    'ganado',
    'aprobado_matricula', 'en_matricula', 'alistamiento', 'espera_entrega', 'entregada',
    'primera_revision', 'segunda_revision', 'tercera_revision',
    'proceso_finalizado',
    'perdido'
  ));

-- 2. Asegurar columnas opcionales que el código de seguimiento necesita
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS nombre_pendiente_aprobacion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS automatizado                boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flujo_activo_id             uuid,
  ADD COLUMN IF NOT EXISTS lead_source                 text,
  ADD COLUMN IF NOT EXISTS numero_factura              text;

-- 3. Mover clientes con whatsapp/messenger/instagram que están en 'nuevo' a 'nuevo_mensaje'
--    (solo los que ya están en seguimiento y tienen canal digital)
UPDATE clientes
SET
  etapa_venta       = 'nuevo_mensaje',
  etapa_venta_orden = -1
WHERE
  en_seguimiento_ventas = true
  AND etapa_venta IN ('nuevo', 'calificado')
  AND (
    whatsapp_number IS NOT NULL
    OR messenger_id IS NOT NULL
    OR instagram_id IS NOT NULL
  )
  AND etapa_venta_orden >= 0;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (ejecutar por separado si quieres confirmar):
-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_name = 'clientes_etapa_venta_check';
-- ══════════════════════════════════════════════════════════════════════════════
