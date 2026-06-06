-- ============================================================
-- OPTIDESK — Migration v2b: Función de stock atómico
-- Ejecutar DESPUÉS de migration_v2.sql
-- ============================================================

-- Ajuste atómico de stock para repuestos UMA
-- p_delta positivo = entrada, negativo = salida (mínimo 0)
CREATE OR REPLACE FUNCTION ajustar_stock_uma(p_repuesto_id UUID, p_delta INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE repuestos_uma
  SET cantidad = GREATEST(0, cantidad + p_delta)
  WHERE id = p_repuesto_id;
END;
$$;

-- Igual para repuestos externos (si se quiere trackear)
-- repuestos_externos no tiene campo cantidad, lo agregamos
ALTER TABLE repuestos_externos ADD COLUMN IF NOT EXISTS cantidad INT DEFAULT 0;

CREATE OR REPLACE FUNCTION ajustar_stock_externo(p_repuesto_id UUID, p_delta INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE repuestos_externos
  SET cantidad = GREATEST(0, cantidad + p_delta)
  WHERE id = p_repuesto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION ajustar_stock_uma    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION ajustar_stock_externo TO authenticated, anon;
