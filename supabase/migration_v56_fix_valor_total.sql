-- ============================================================
-- MIGRACIÓN v56 — Corregir valor_total desactualizado en ordenes
--
-- handleAddLavaMoto / handleDeleteLavaMoto en ordenes/[id]/page.tsx
-- actualizaban estado_pago y valor_abono al agregar/quitar un servicio
-- de lavado, pero nunca recalculaban ordenes.valor_total. Eso dejaba el
-- total guardado permanentemente desactualizado (sin el costo del
-- lavado) para cualquier orden donde se agregó una lavada, y toda
-- pantalla que confía en esa columna (como el listado de
-- /admin/ordenes agrupado por placa) heredaba el total incorrecto.
--
-- El código ya se corrigió para que estos handlers (y handleAddPago/
-- handleDeletePago) también escriban valor_total. Esta migración hace
-- el backfill de una sola vez: recalcula valor_total para TODAS las
-- órdenes existentes a partir de items_orden + lava_moto_ordenes, para
-- que el listado muestre el total correcto de inmediato sin esperar a
-- que se registre un nuevo pago o lavada en cada orden.
-- ============================================================

UPDATE ordenes o
SET valor_total = COALESCE(
    (SELECT SUM(i.precio_venta * i.cantidad) FROM items_orden i WHERE i.orden_id = o.id), 0
  ) + COALESCE(
    (SELECT SUM(l.precio_venta_unitario * l.cantidad) FROM lava_moto_ordenes l WHERE l.orden_id = o.id), 0
  );

-- FIN MIGRACIÓN v56
