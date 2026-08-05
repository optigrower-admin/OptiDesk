-- v141: fecha_cierre nunca se llenó automáticamente (el trigger que debía
-- hacerlo, mencionado en el comentario de v99, nunca se implementó) —
-- causaba que "Ventas realizadas", "Ticket promedio" y "Tendencia de
-- Ventas" en el dashboard casi no tuvieran datos, porque filtran por
-- fecha_cierre dentro del período. Ya se corrigió hacia adelante en
-- /api/admin/ventas/guardar (se setea al entrar a una etapa es_ganado o
-- es_perdido). Esto rellena los clientes que ya están en esa etapa y
-- nunca la tuvieron: usa la fecha del cambio de etapa más reciente hacia
-- esa etapa si existe en el historial, o si no, la fecha de creación.

UPDATE clientes c
SET fecha_cierre = COALESCE(
  (SELECT MAX(h.created_at) FROM historial_etapas_cliente h
   WHERE h.cliente_id = c.id AND h.etapa_nueva = c.etapa_venta),
  c.created_at
)
FROM etapas_pipeline e
WHERE e.tenant_id = c.tenant_id
  AND e.clave = c.etapa_venta
  AND (e.es_ganado OR e.es_perdido)
  AND c.fecha_cierre IS NULL;
