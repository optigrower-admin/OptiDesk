-- ============================================================
-- MIGRACIÓN v48 — Método de pago por ítem (items_orden)
--
-- Permite registrar con qué método se le pagó al proveedor (repuestos
-- Externos/Terceros) o con qué método se cobró (Insumos, Porta Placas)
-- en cada ítem individual de una orden. Necesario para que el panel
-- de Caja pueda atribuir esos movimientos a una cuenta específica en
-- vez de dejarlos en "Sin método especificado".
-- ============================================================

ALTER TABLE items_orden ADD COLUMN IF NOT EXISTS metodo_pago_id UUID REFERENCES metodos_pago(id);

-- Backfill: los ítems existentes (externo/insumo, con costo o precio_venta)
-- que no tengan método asignado se asumen pagados en Efectivo, según
-- indicó el usuario — de aquí en adelante sí se exige seleccionarlo.
UPDATE items_orden io
SET metodo_pago_id = (
  SELECT mp.id FROM metodos_pago mp
  JOIN ordenes o ON o.id = io.orden_id
  WHERE mp.tenant_id = o.tenant_id AND lower(mp.nombre) = 'efectivo'
  LIMIT 1
)
WHERE io.metodo_pago_id IS NULL
  AND io.origen IN ('externo', 'insumo')
  AND (io.costo > 0 OR io.precio_venta > 0);

-- ============================================================
-- FIN MIGRACIÓN v48
-- ============================================================
