-- v103: Habilita etapas realmente dinámicas por tenant
--
-- 1) Quita el CHECK constraint de clientes.etapa_venta — hasta ahora solo
--    aceptaba los ~21 valores hardcodeados de pipeline.ts, así que una etapa
--    NUEVA creada desde Config Ventas → Pipelines y Etapas nunca se hubiera
--    podido usar de verdad (el guardado habría fallado). De aquí en adelante
--    la validación de que la etapa exista para ese tenant se hace en la
--    aplicación (API /api/admin/ventas/guardar), contra la tabla
--    etapas_pipeline — el mismo patrón ya usado en el resto del proyecto.
--
-- 2) Actualiza los triggers de "auto-seguimiento" (v82) para que, en vez de
--    forzar 'nuevo_mensaje' a secas, busquen cuál es la etapa marcada como
--    "es_etapa_inicial" para ESE tenant en etapas_pipeline — así, si un
--    tenant cambia cuál etapa es la inicial (o la renombra), los mensajes
--    nuevos siguen cayendo en el lugar correcto.

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_etapa_venta_check;

CREATE OR REPLACE FUNCTION fn_auto_seguimiento_mensaje_entrante()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_tenant_id  uuid;
  v_etapa      text;
  v_orden      integer;
BEGIN
  IF NEW.direccion IS DISTINCT FROM 'entrante' THEN
    RETURN NEW;
  END IF;

  SELECT cliente_id INTO v_cliente_id FROM conversaciones WHERE id = NEW.conversacion_id;
  IF v_cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = v_cliente_id AND en_seguimiento_ventas = true) THEN
    SELECT tenant_id INTO v_tenant_id FROM clientes WHERE id = v_cliente_id;

    SELECT clave, orden INTO v_etapa, v_orden
    FROM etapas_pipeline
    WHERE tenant_id = v_tenant_id AND es_etapa_inicial = true
    ORDER BY orden LIMIT 1;

    IF v_etapa IS NULL THEN
      v_etapa := 'nuevo_mensaje'; v_orden := -1;
    END IF;

    UPDATE clientes
    SET en_seguimiento_ventas = true, etapa_venta = v_etapa, etapa_venta_orden = v_orden
    WHERE id = v_cliente_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_auto_seguimiento_nueva_conv()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_etapa     text;
  v_orden     integer;
BEGIN
  IF NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clientes WHERE id = NEW.cliente_id AND en_seguimiento_ventas = true) THEN
    SELECT tenant_id INTO v_tenant_id FROM clientes WHERE id = NEW.cliente_id;

    SELECT clave, orden INTO v_etapa, v_orden
    FROM etapas_pipeline
    WHERE tenant_id = v_tenant_id AND es_etapa_inicial = true
    ORDER BY orden LIMIT 1;

    IF v_etapa IS NULL THEN
      v_etapa := 'nuevo_mensaje'; v_orden := -1;
    END IF;

    UPDATE clientes
    SET en_seguimiento_ventas = true, etapa_venta = v_etapa, etapa_venta_orden = v_orden
    WHERE id = NEW.cliente_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Los triggers ya existentes (trg_auto_seguimiento_mensaje / trg_auto_seguimiento_conv)
-- no necesitan recrearse — CREATE OR REPLACE FUNCTION ya actualiza su comportamiento.
