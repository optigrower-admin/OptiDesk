-- Agrega columnas de información financiera/laboral al cliente
-- Requeridas por DatosClienteTab en seguimiento de ventas

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS ocupacion          text,
  ADD COLUMN IF NOT EXISTS tipo_contrato      text,
  ADD COLUMN IF NOT EXISTS ingresos_mensuales numeric,
  ADD COLUMN IF NOT EXISTS gastos_mensuales   numeric;
