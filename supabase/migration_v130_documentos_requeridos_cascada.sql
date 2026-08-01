-- v130: Documentos requeridos deja de BLOQUEAR el cambio de etapa — ahora
-- solo se avisa (popup no bloqueante) al abrir la ficha del cliente, con una
-- lista de documentos que va creciendo en cascada según la etapa:
--   - Vendida/Carta Aprobación ('ganado'):        Carta de Aprobación, Copia Cédula
--   - Aprobados para Matricular ('aprobado_matricula'): + Factura de Venta
--   - En matrícula ('en_matricula'):               + Manifiesto de Importación,
--                                                    Contrato de Mandato, FUNAL
-- (la cascada real — heredar la lista de la etapa configurada más cercana
-- hacia atrás — vive en useEtapasPipeline.ts, igual que aprobacion_gerencia)

-- La fila sembrada en v126 sobre 'ganado' tenía los 6 documentos y bloqueaba;
-- ahora queda con la lista corta y sin bloquear.
UPDATE reglas_etapa
SET documentos_requeridos = '["Carta de Aprobación","Copia Cédula"]'::jsonb,
    bloquea_cambio_etapa = FALSE
WHERE campo = 'documento_requerido'
  AND etapa_id IN (SELECT id FROM etapas_pipeline WHERE clave = 'ganado');

INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden, documentos_requeridos)
SELECT e.tenant_id, e.id, 'documento_requerido', 'Documentos requeridos',
       'Súbelos en la pestaña Archivos de la ficha del cliente.',
       '#b45309', FALSE, 10,
       '["Carta de Aprobación","Factura de Venta","Copia Cédula"]'::jsonb
FROM etapas_pipeline e WHERE e.clave = 'aprobado_matricula'
ON CONFLICT (etapa_id, campo) DO UPDATE
  SET documentos_requeridos = EXCLUDED.documentos_requeridos, bloquea_cambio_etapa = FALSE;

INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden, documentos_requeridos)
SELECT e.tenant_id, e.id, 'documento_requerido', 'Documentos requeridos',
       'Súbelos en la pestaña Archivos de la ficha del cliente.',
       '#b45309', FALSE, 10,
       '["Carta de Aprobación","Factura de Venta","Manifiesto de Importación","Copia Cédula","Contrato de Mandato","FUNAL"]'::jsonb
FROM etapas_pipeline e WHERE e.clave = 'en_matricula'
ON CONFLICT (etapa_id, campo) DO UPDATE
  SET documentos_requeridos = EXCLUDED.documentos_requeridos, bloquea_cambio_etapa = FALSE;
