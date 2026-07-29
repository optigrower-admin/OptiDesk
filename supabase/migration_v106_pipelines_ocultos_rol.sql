-- v106: Ocultar pipelines completos por rol (configurable desde Config Ventas)
--
-- Agrega roles_ocultos a pipelines_venta: lista de roles que no deben ver ese
-- pipeline como pestaña en el Kanban. Se siembra ocultando "Pipeline Post-Venta"
-- para el rol freelancer en todos los tenants, siguiendo el mismo criterio de
-- negocio que ya se aplicó al bloqueo de edición (v105): el freelancer no
-- gestiona posventa.

ALTER TABLE pipelines_venta ADD COLUMN IF NOT EXISTS roles_ocultos TEXT[] NOT NULL DEFAULT '{}';

UPDATE pipelines_venta
SET roles_ocultos = ARRAY['freelancer']
WHERE clave = 'postventa' AND NOT ('freelancer' = ANY(roles_ocultos));
