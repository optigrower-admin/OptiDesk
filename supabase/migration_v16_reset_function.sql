-- Migration v16: Función SECURITY DEFINER para reset de empresa
-- Ejecutar en Supabase → SQL Editor
-- Soluciona: RLS que bloqueaba deletes, orden incorrecto de auditoría,
--            tabla proveedores omitida, errores silenciosos.

CREATE OR REPLACE FUNCTION reset_tenant_data(
  p_tenant_id UUID,
  p_modo      TEXT   -- 'completo' | 'operativo'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER          -- corre como postgres: bypasea RLS completamente
SET search_path = public
AS $$
DECLARE
  v_nombre  TEXT;
  v_caller  TEXT;
BEGIN
  -- ── Seguridad: solo control_total ────────────────────────────
  SELECT rol INTO v_caller FROM usuarios WHERE id = auth.uid();
  IF v_caller IS DISTINCT FROM 'control_total' THEN
    RAISE EXCEPTION 'Sin permisos: solo control_total puede reiniciar empresas';
  END IF;

  IF p_modo NOT IN ('completo', 'operativo') THEN
    RAISE EXCEPTION 'Modo inválido: %', p_modo;
  END IF;

  -- ── Verificar empresa ────────────────────────────────────────
  SELECT nombre INTO v_nombre FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empresa no encontrada';
  END IF;

  -- ── Borrar en orden correcto (FK constraints) ─────────────────
  -- 1. Movimientos de inventario (FK SET NULL → ordenes, items_orden, repuestos)
  DELETE FROM movimientos_inventario WHERE tenant_id = p_tenant_id;

  -- 2. Medios (FK CASCADE desde ordenes, pero explícito aquí)
  DELETE FROM medios WHERE tenant_id = p_tenant_id;

  -- 3. Items de órdenes (FK CASCADE desde ordenes)
  DELETE FROM items_orden
    WHERE orden_id IN (SELECT id FROM ordenes WHERE tenant_id = p_tenant_id);

  -- 4. Órdenes (los triggers de auditoría crean registros en auditoria aquí)
  DELETE FROM ordenes WHERE tenant_id = p_tenant_id;

  -- 5. Repuestos externos
  DELETE FROM repuestos_externos WHERE tenant_id = p_tenant_id;

  -- 6. En modo completo: motos, clientes, proveedores
  IF p_modo = 'completo' THEN
    DELETE FROM motos       WHERE tenant_id = p_tenant_id;
    DELETE FROM clientes    WHERE tenant_id = p_tenant_id;
    DELETE FROM proveedores WHERE tenant_id = p_tenant_id;
  END IF;

  -- 7. Auditoría AL FINAL (limpia también los registros generados por triggers)
  DELETE FROM auditoria WHERE tenant_id = p_tenant_id;

  -- 8. Resetear contador de almacenamiento
  UPDATE tenants SET storage_usado_bytes = 0 WHERE id = p_tenant_id;

  -- ── Resultado ────────────────────────────────────────────────
  IF p_modo = 'completo' THEN
    RETURN format('Empresa "%s" reiniciada completamente', v_nombre);
  ELSE
    RETURN format('Órdenes e historial de "%s" eliminados — clientes y motos conservados', v_nombre);
  END IF;
END;
$$;

-- Usuarios autenticados pueden llamar la función
-- (la seguridad real está dentro con el chequeo de rol control_total)
GRANT EXECUTE ON FUNCTION reset_tenant_data(UUID, TEXT) TO authenticated;
