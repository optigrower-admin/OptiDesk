-- ============================================================
-- Migration v6: Triggers de auditoría automática
-- Captura ediciones y eliminaciones en ordenes, items_orden y medios
-- ============================================================

-- ── ORDENES ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_ordenes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO auditoria (tenant_id, tabla, registro_id, tipo, valor_anterior, valor_nuevo, descripcion, usuario_id)
    VALUES (
      NEW.tenant_id,
      'ordenes',
      NEW.id,
      'edicion',
      to_jsonb(OLD),
      to_jsonb(NEW),
      'Orden #' || NEW.numero || ' editada · placa: ' || NEW.placa,
      auth.uid()
    );

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO auditoria (tenant_id, tabla, registro_id, tipo, valor_anterior, valor_nuevo, descripcion, usuario_id)
    VALUES (
      OLD.tenant_id,
      'ordenes',
      OLD.id,
      'eliminacion',
      to_jsonb(OLD),
      NULL,
      'Orden #' || OLD.numero || ' eliminada · placa: ' || OLD.placa,
      auth.uid()
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_ordenes ON ordenes;
CREATE TRIGGER trg_audit_ordenes
AFTER UPDATE OR DELETE ON ordenes
FOR EACH ROW EXECUTE FUNCTION fn_audit_ordenes();


-- ── ITEMS_ORDEN ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_items_orden()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tenant_id UUID;
  v_numero    INT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT tenant_id, numero INTO v_tenant_id, v_numero FROM ordenes WHERE id = NEW.orden_id;
    INSERT INTO auditoria (tenant_id, tabla, registro_id, tipo, valor_anterior, valor_nuevo, descripcion, usuario_id)
    VALUES (
      v_tenant_id,
      'items_orden',
      NEW.id,
      'edicion',
      to_jsonb(OLD),
      to_jsonb(NEW),
      'Ítem editado en orden #' || v_numero || ': ' || NEW.descripcion,
      auth.uid()
    );

  ELSIF TG_OP = 'DELETE' THEN
    SELECT tenant_id, numero INTO v_tenant_id, v_numero FROM ordenes WHERE id = OLD.orden_id;
    INSERT INTO auditoria (tenant_id, tabla, registro_id, tipo, valor_anterior, valor_nuevo, descripcion, usuario_id)
    VALUES (
      v_tenant_id,
      'items_orden',
      OLD.id,
      'eliminacion',
      to_jsonb(OLD),
      NULL,
      'Ítem eliminado de orden #' || v_numero || ': ' || OLD.descripcion,
      auth.uid()
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_items_orden ON items_orden;
CREATE TRIGGER trg_audit_items_orden
AFTER UPDATE OR DELETE ON items_orden
FOR EACH ROW EXECUTE FUNCTION fn_audit_items_orden();


-- ── MEDIOS ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_medios()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tenant_id UUID;
  v_numero    INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT tenant_id, numero INTO v_tenant_id, v_numero FROM ordenes WHERE id = OLD.orden_id;
    INSERT INTO auditoria (tenant_id, tabla, registro_id, tipo, valor_anterior, valor_nuevo, descripcion, usuario_id)
    VALUES (
      v_tenant_id,
      'medios',
      OLD.id,
      'eliminacion',
      to_jsonb(OLD),
      NULL,
      'Archivo eliminado de orden #' || v_numero || ': ' || COALESCE(OLD.nombre_archivo, OLD.tipo::TEXT),
      auth.uid()
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_medios ON medios;
CREATE TRIGGER trg_audit_medios
AFTER DELETE ON medios
FOR EACH ROW EXECUTE FUNCTION fn_audit_medios();
