-- v145: mover el disparador de fecha_matricula de "En matrícula" a
-- "Alistamiento" — la matrícula real se cuenta desde que el cliente entra a
-- Alistamiento en adelante, no solo en la etapa "En matrícula".

UPDATE etapas_pipeline SET es_matricula = false WHERE clave = 'en_matricula' AND es_matricula = true;
UPDATE etapas_pipeline SET es_matricula = true  WHERE clave = 'alistamiento';

-- Recalcula fecha_matricula para TODOS los clientes que ya están en
-- Alistamiento o una etapa posterior (sobreescribe valores previos que
-- hayan quedado con la fecha de "En matrícula", igual que hizo v142 para
-- fecha_cierre).
WITH matricula AS (
  SELECT tenant_id, pipeline_id, clave, orden FROM etapas_pipeline WHERE es_matricula = true
)
UPDATE clientes c
SET fecha_matricula = COALESCE(
  (SELECT MAX(h.created_at) FROM historial_etapas_cliente h
   WHERE h.cliente_id = c.id
     AND h.etapa_nueva IN (SELECT m.clave FROM matricula m WHERE m.tenant_id = ec.tenant_id AND m.pipeline_id = ec.pipeline_id)),
  c.fecha_matricula, c.fecha_cierre, c.created_at
)
FROM etapas_pipeline ec
JOIN matricula m2 ON m2.tenant_id = ec.tenant_id AND m2.pipeline_id = ec.pipeline_id
WHERE ec.tenant_id = c.tenant_id
  AND ec.clave = c.etapa_venta
  AND ec.orden >= m2.orden;

-- Clientes que retrocedieron por debajo de Alistamiento: limpia fecha_matricula
-- para que quede consistente con la nueva regla.
UPDATE clientes c
SET fecha_matricula = NULL
FROM etapas_pipeline ec
JOIN etapas_pipeline em ON em.tenant_id = ec.tenant_id AND em.pipeline_id = ec.pipeline_id AND em.es_matricula = true
WHERE ec.tenant_id = c.tenant_id
  AND ec.clave = c.etapa_venta
  AND ec.orden < em.orden
  AND c.fecha_matricula IS NOT NULL;
