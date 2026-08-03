-- v132: Fecha de corte para bloquear edición/eliminación de repuestos ya
-- contabilizados. Gerencia establece una fecha; los ítems de items_orden
-- (UMA y externos) con created_at &lt;= esa fecha quedan de solo lectura para
-- todos los roles excepto gerencia/dueño/control_total. Agregar repuestos
-- nuevos NUNCA se bloquea — solo editar/eliminar los ya existentes.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS repuestos_fecha_corte DATE;
