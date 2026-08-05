-- v151: resumen de pipeline por correo (gráfico de barras + detalle por
-- etapa) para cada asesor — activable/desactivable por persona, aparte del
-- resumen diario de recordatorios que ya existía.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS recibe_resumen_pipeline BOOLEAN NOT NULL DEFAULT false;
