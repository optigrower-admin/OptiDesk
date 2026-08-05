-- v140: una Medida ahora puede combinar varios "términos" (tabla+campo+
-- agregación, cada uno con sus propios filtros) con +, -, *, / — para poder
-- sumar/restar/dividir directamente al crear la medida, sin pasar por una
-- Variable calculada aparte.

ALTER TABLE dashboard_medidas ADD COLUMN IF NOT EXISTS terminos JSONB NOT NULL DEFAULT '[]';

UPDATE dashboard_medidas
SET terminos = jsonb_build_array(
  jsonb_build_object(
    'tabla', tabla, 'campo', campo, 'agregacion', agregacion,
    'campo_fecha', campo_fecha, 'filtros', COALESCE(filtros, '[]'::jsonb), 'operador', '+'
  )
)
WHERE terminos = '[]'::jsonb AND tabla IS NOT NULL;

ALTER TABLE dashboard_medidas DROP COLUMN IF EXISTS tabla;
ALTER TABLE dashboard_medidas DROP COLUMN IF EXISTS campo;
ALTER TABLE dashboard_medidas DROP COLUMN IF EXISTS agregacion;
ALTER TABLE dashboard_medidas DROP COLUMN IF EXISTS campo_fecha;
ALTER TABLE dashboard_medidas DROP COLUMN IF EXISTS filtros;
