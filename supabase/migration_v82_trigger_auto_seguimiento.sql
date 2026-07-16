-- ══════════════════════════════════════════════════════════════════════════════
-- Migration v82: Trigger DB-level para auto-seguimiento
-- ──────────────────────────────────────────────────────────────────────────────
-- OBJETIVO: Cuando llega un mensaje entrante, el cliente vinculado a esa
-- conversación se coloca AUTOMÁTICAMENTE en "Nuevo Contacto - Mensaje".
-- Esta lógica vive en la base de datos y es INDEPENDIENTE del código del webhook.
-- No importa si el webhook falla, si hay un error de constraint, o si la
-- columna nombre_pendiente_aprobacion no existe — el trigger cubre el caso.
--
-- TAMBIÉN: Trigger para nueva conversación (cubre el caso donde se creó la
-- conversación con cliente_id ya vinculado y el primer mensaje llega luego).
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Función principal ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auto_seguimiento_mensaje_entrante()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- corre como postgres, bypassea RLS
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
BEGIN
  -- Solo mensajes entrantes
  IF NEW.direccion IS DISTINCT FROM 'entrante' THEN
    RETURN NEW;
  END IF;

  -- Obtener cliente vinculado a la conversación
  SELECT cliente_id INTO v_cliente_id
  FROM conversaciones
  WHERE id = NEW.conversacion_id;

  IF v_cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Poner en seguimiento sólo si NO está ya en seguimiento
  IF NOT EXISTS (
    SELECT 1 FROM clientes WHERE id = v_cliente_id AND en_seguimiento_ventas = true
  ) THEN
    BEGIN
      -- Intento principal: etapa 'nuevo_mensaje' (requiere migration_v81)
      UPDATE clientes
      SET
        en_seguimiento_ventas = true,
        etapa_venta           = 'nuevo_mensaje',
        etapa_venta_orden     = -1
      WHERE id = v_cliente_id;
    EXCEPTION WHEN check_violation THEN
      -- Fallback: CHECK constraint no incluye 'nuevo_mensaje' aún
      UPDATE clientes
      SET
        en_seguimiento_ventas = true,
        etapa_venta           = 'nuevo',
        etapa_venta_orden     = 0
      WHERE id = v_cliente_id;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_seguimiento_mensaje ON mensajes;
CREATE TRIGGER trg_auto_seguimiento_mensaje
  AFTER INSERT ON mensajes
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_seguimiento_mensaje_entrante();

-- ─── Función para nueva conversación ─────────────────────────────────────────
-- Cuando se crea una conversación nueva con cliente_id ya vinculado,
-- también asegurar que el cliente entre en seguimiento.
CREATE OR REPLACE FUNCTION fn_auto_seguimiento_nueva_conv()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND en_seguimiento_ventas = true
  ) THEN
    BEGIN
      UPDATE clientes
      SET
        en_seguimiento_ventas = true,
        etapa_venta           = 'nuevo_mensaje',
        etapa_venta_orden     = -1
      WHERE id = NEW.cliente_id;
    EXCEPTION WHEN check_violation THEN
      UPDATE clientes
      SET
        en_seguimiento_ventas = true,
        etapa_venta           = 'nuevo',
        etapa_venta_orden     = 0
      WHERE id = NEW.cliente_id;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_seguimiento_conv ON conversaciones;
CREATE TRIGGER trg_auto_seguimiento_conv
  AFTER INSERT ON conversaciones
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_seguimiento_nueva_conv();

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (ejecutar por separado para confirmar):
-- SELECT routine_name FROM information_schema.routines
--   WHERE routine_name LIKE 'fn_auto_seguimiento%';
-- SELECT trigger_name, event_object_table FROM information_schema.triggers
--   WHERE trigger_name LIKE 'trg_auto_seguimiento%';
-- ══════════════════════════════════════════════════════════════════════════════
