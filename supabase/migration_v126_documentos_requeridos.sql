-- v126: Documentos requeridos por etapa — reutiliza el constructor de reglas
-- (reglas_etapa) agregando un nuevo campo 'documento_requerido' que en vez de
-- un solo valor guarda una LISTA de nombres de documento (columna nueva
-- documentos_requeridos JSONB), porque el UNIQUE(etapa_id, campo) existente
-- solo deja una fila de este campo por etapa. También agrega tipo_documento
-- a archivos_cliente para poder relacionar cada archivo subido con uno de
-- esos documentos requeridos.

ALTER TABLE reglas_etapa DROP CONSTRAINT IF EXISTS reglas_etapa_campo_check;
ALTER TABLE reglas_etapa ADD CONSTRAINT reglas_etapa_campo_check CHECK (campo IN (
  'celular', 'placa', 'alistamiento',
  'numero_factura', 'numero_carta_negociacion',
  'fecha_entrega', 'aprobacion_gerencia',
  'documento_requerido'
));

ALTER TABLE reglas_etapa ADD COLUMN IF NOT EXISTS documentos_requeridos JSONB;

ALTER TABLE archivos_cliente ADD COLUMN IF NOT EXISTS tipo_documento TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEMILLA: los 6 documentos pedidos, obligatorios al llegar a "Vendida/Carta
-- Aprobación" (clave de etapa 'ganado'), para cada tenant existente.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden, documentos_requeridos)
SELECT e.tenant_id, e.id, 'documento_requerido', 'Documentos requeridos para matricular',
       'Sube estos documentos en la pestaña Archivos de la ficha del cliente antes de continuar.',
       '#b91c1c', TRUE, 10,
       '["Carta de Aprobación","Factura de Venta","Manifiesto de Importación","Copia Cédula","Contrato de Mandato","FUNAL"]'::jsonb
FROM etapas_pipeline e WHERE e.clave = 'ganado'
ON CONFLICT (etapa_id, campo) DO NOTHING;
