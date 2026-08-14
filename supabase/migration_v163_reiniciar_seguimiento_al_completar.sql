-- Al completar un recordatorio automático (tipo_automatico no nulo, generado
-- por el cron de "Recordatorios automáticos" cuando un cliente lleva más de
-- los días configurados sin movimiento), reinicia el conteo tocando
-- clientes.updated_at — así el aviso de "sin seguimiento" se apaga y solo
-- vuelve a encenderse si el cliente vuelve a pasarse de los días configurados
-- sin que nadie le dé check a otra alerta. SECURITY DEFINER porque cualquier
-- rol puede completar un recordatorio propio, pero solo admin/gerencia pueden
-- actualizar clientes directamente (RLS admin_update_clientes).
CREATE OR REPLACE FUNCTION reiniciar_seguimiento_al_completar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.completado = true AND (OLD.completado IS DISTINCT FROM true) AND NEW.tipo_automatico IS NOT NULL THEN
    UPDATE clientes SET updated_at = now() WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reiniciar_seguimiento_al_completar ON recordatorios;
CREATE TRIGGER trg_reiniciar_seguimiento_al_completar
  AFTER UPDATE ON recordatorios
  FOR EACH ROW
  EXECUTE FUNCTION reiniciar_seguimiento_al_completar();
