-- v142: corrige el backfill de fecha_cierre de v141.
--
-- El bug: buscaba en historial_etapas_cliente la fecha en que el cliente
-- entró a su etapa ACTUAL (c.etapa_venta) — pero para un cliente que ya
-- avanzó más allá de "Vendida" (ej. está en "En matrícula"), eso encuentra
-- CUÁNDO ENTRÓ A MATRÍCULA, no cuándo se vendió — dejando fecha_cierre con
-- una fecha mucho más reciente de la real, e inflando el conteo de "ventas
-- de este mes" con ventas viejas.
--
-- La corrección: buscar la fecha en que entró específicamente a la etapa
-- marcada es_ganado=true (o es_perdido=true) de su pipeline, sin importar
-- en qué etapa esté ahora. Se recalculan TODOS los clientes en etapa
-- vendida/posterior o perdida (no solo los que tenían fecha_cierre en
-- NULL), porque el backfill de v141 ya dejó valores incorrectos que hay
-- que sobrescribir.

WITH ganado AS (
  SELECT tenant_id, pipeline_id, clave, orden FROM etapas_pipeline WHERE es_ganado = true
),
perdido AS (
  SELECT tenant_id, pipeline_id, clave FROM etapas_pipeline WHERE es_perdido = true
)
UPDATE clientes c
SET fecha_cierre = COALESCE(
  (
    SELECT MAX(h.created_at)
    FROM historial_etapas_cliente h
    WHERE h.cliente_id = c.id
      AND h.etapa_nueva IN (
        SELECT g.clave FROM ganado g WHERE g.tenant_id = ec.tenant_id AND g.pipeline_id = ec.pipeline_id
        UNION
        SELECT p.clave FROM perdido p WHERE p.tenant_id = ec.tenant_id AND p.pipeline_id = ec.pipeline_id
      )
  ),
  c.created_at
)
FROM etapas_pipeline ec
LEFT JOIN ganado g2 ON g2.tenant_id = ec.tenant_id AND g2.pipeline_id = ec.pipeline_id
WHERE ec.tenant_id = c.tenant_id
  AND ec.clave = c.etapa_venta
  AND (ec.es_perdido OR (g2.orden IS NOT NULL AND ec.orden >= g2.orden));
