-- ============================================================
-- MIGRACIÓN v55 — Vincular propietario al crear una orden (cualquier rol)
--
-- Al crear una orden de Servicio Técnico, upsertMotoCliente() intenta
-- dejar a la moto con motos.cliente_id = el cliente de la orden. Pero la
-- política "admin_update_motos" (v5) solo permite UPDATE en motos a
-- admin/gerencia — un mecánico creando la orden no puede actualizar esa
-- columna, el UPDATE queda bloqueado por RLS sin lanzar error (0 filas
-- afectadas), y la moto se ve "Sin propietario asignado" aunque la
-- orden sí muestre el cliente correctamente.
--
-- Se agrega una función SECURITY DEFINER (mismo patrón que
-- ajustar_stock_uma/ajustar_stock_externo) que vincula moto↔cliente
-- saltándose esa restricción, pero verificando igual que ambos
-- registros sean del tenant del usuario autenticado.
-- ============================================================

CREATE OR REPLACE FUNCTION vincular_moto_cliente(p_moto_id UUID, p_cliente_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE motos
  SET cliente_id = p_cliente_id
  WHERE id = p_moto_id AND tenant_id = get_user_tenant_id();
END;
$$;

GRANT EXECUTE ON FUNCTION vincular_moto_cliente TO authenticated;

-- Mismo problema, mismo arreglo: cuando upsertMotoCliente() encuentra un
-- cliente existente por cédula y actualiza su nombre/celular con lo que
-- se tecleó en la orden, ese UPDATE en "clientes" también está
-- restringido a admin/gerencia (admin_update_clientes, v5) y se pierde
-- silenciosamente si quien crea la orden es mecánico.
CREATE OR REPLACE FUNCTION actualizar_cliente_orden(p_cliente_id UUID, p_nombre TEXT, p_celular TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE clientes
  SET nombre  = COALESCE(p_nombre, nombre),
      celular = COALESCE(p_celular, celular)
  WHERE id = p_cliente_id AND tenant_id = get_user_tenant_id();
END;
$$;

GRANT EXECUTE ON FUNCTION actualizar_cliente_orden TO authenticated;

-- ============================================================
-- FIN MIGRACIÓN v55
-- ============================================================
