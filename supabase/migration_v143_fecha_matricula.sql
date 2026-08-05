-- v143: fecha de matrícula, igual patrón que fecha_cierre (venta) —
-- se guarda automáticamente al entrar a la etapa marcada es_matricula,
-- editable a mano solo por gerencia.

ALTER TABLE etapas_pipeline ADD COLUMN IF NOT EXISTS es_matricula BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_matricula TIMESTAMPTZ;

-- Marca automáticamente "En matrícula" como la etapa que dispara
-- fecha_matricula (es la clave usada en este tenant para esa etapa).
UPDATE etapas_pipeline SET es_matricula = true WHERE clave = 'en_matricula';

-- Backfill: para clientes que ya están en matrícula o más adelante, usa la
-- fecha en que entraron específicamente a la etapa es_matricula (según el
-- historial), o la fecha de venta si no hay historial de esa etapa.
WITH matricula AS (
  SELECT tenant_id, pipeline_id, clave, orden FROM etapas_pipeline WHERE es_matricula = true
)
UPDATE clientes c
SET fecha_matricula = COALESCE(
  (SELECT MAX(h.created_at) FROM historial_etapas_cliente h
   WHERE h.cliente_id = c.id
     AND h.etapa_nueva IN (SELECT m.clave FROM matricula m WHERE m.tenant_id = ec.tenant_id AND m.pipeline_id = ec.pipeline_id)),
  c.fecha_cierre
)
FROM etapas_pipeline ec
JOIN matricula m2 ON m2.tenant_id = ec.tenant_id AND m2.pipeline_id = ec.pipeline_id
WHERE ec.tenant_id = c.tenant_id
  AND ec.clave = c.etapa_venta
  AND ec.orden >= m2.orden
  AND c.fecha_matricula IS NULL;
