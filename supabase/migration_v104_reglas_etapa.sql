-- v104: Reglas y Alertas por etapa — configurables (constructor libre)
--
-- Hasta ahora "qué exige cada etapa" (celular, placa, factura, carta de
-- negociación, fecha de entrega, aprobación de gerencia) era un puñado de
-- columnas booleanas fijas en etapas_pipeline. Esta migración las convierte
-- en filas de una tabla nueva — reglas_etapa — para que cada empresa pueda
-- agregar, editar, reordenar o eliminar sus propias reglas de alerta/bloqueo
-- por etapa, con su propio texto y color, en vez de estar limitada a esas
-- 6 casillas fijas.
--
-- Es aditiva: las columnas booleanas viejas en etapas_pipeline NO se tocan
-- ni se borran (quedan como historial), pero el código deja de leerlas —
-- de aquí en adelante la fuente de verdad es reglas_etapa. La semilla de
-- abajo copia exactamente el comportamiento actual (incluyendo Motospace38)
-- a filas de reglas_etapa, así que nada cambia visualmente al desplegar.

CREATE TABLE IF NOT EXISTS reglas_etapa (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  etapa_id              UUID NOT NULL REFERENCES etapas_pipeline(id) ON DELETE CASCADE,
  campo                 TEXT NOT NULL CHECK (campo IN (
                           'celular', 'placa', 'alistamiento',
                           'numero_factura', 'numero_carta_negociacion',
                           'fecha_entrega', 'aprobacion_gerencia'
                         )),
  etiqueta               TEXT NOT NULL,
  mensaje_ayuda          TEXT,
  color                  TEXT NOT NULL DEFAULT '#f97316',
  bloquea_cambio_etapa   BOOLEAN NOT NULL DEFAULT FALSE,
  activa                 BOOLEAN NOT NULL DEFAULT TRUE,
  orden                  INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(etapa_id, campo)
);

CREATE INDEX IF NOT EXISTS idx_reglas_etapa_tenant ON reglas_etapa(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reglas_etapa_etapa  ON reglas_etapa(etapa_id);

ALTER TABLE reglas_etapa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_reglas_etapa_all" ON reglas_etapa;
CREATE POLICY "tenant_reglas_etapa_all" ON reglas_etapa
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reglas_etapa TO anon, authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEMILLA: replica exacta del comportamiento actual, para cada tenant existente
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden)
SELECT e.tenant_id, e.id, 'celular', 'Sin celular', 'Ingresa el número de celular del cliente.', '#f97316', FALSE, 0
FROM etapas_pipeline e WHERE e.requiere_celular = TRUE
ON CONFLICT (etapa_id, campo) DO NOTHING;

INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden)
SELECT e.tenant_id, e.id, 'placa', 'Sin placa', 'Ingresa la placa de la moto entregada a este cliente.', '#dc2626', FALSE, 1
FROM etapas_pipeline e WHERE e.requiere_placa = TRUE
ON CONFLICT (etapa_id, campo) DO NOTHING;

INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden)
SELECT e.tenant_id, e.id, 'numero_carta_negociacion', 'Sin carta negociación', 'Ingresa el número de carta de negociación de esta venta.', '#ea580c', FALSE, 2
FROM etapas_pipeline e WHERE e.requiere_carta_negociacion = TRUE
ON CONFLICT (etapa_id, campo) DO NOTHING;

INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden)
SELECT e.tenant_id, e.id, 'numero_factura', 'Sin factura', 'Ingresa el número de factura de esta venta.', '#f97316', FALSE, 3
FROM etapas_pipeline e WHERE e.requiere_factura = TRUE
ON CONFLICT (etapa_id, campo) DO NOTHING;

INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden)
SELECT e.tenant_id, e.id, 'fecha_entrega', 'Sin fecha de entrega', 'Ingresa la fecha de entrega de la moto al cliente.', '#0284c7', FALSE, 4
FROM etapas_pipeline e WHERE e.requiere_fecha_entrega = TRUE
ON CONFLICT (etapa_id, campo) DO NOTHING;

INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden)
SELECT e.tenant_id, e.id, 'aprobacion_gerencia', 'Aprobación pendiente para matricular', 'Debes pedir aprobación para matricular para poder cambiar de etapa.', '#d97706', TRUE, 5
FROM etapas_pipeline e WHERE e.requiere_aprobacion_gerencia = TRUE
ON CONFLICT (etapa_id, campo) DO NOTHING;

-- "Alistamiento" no tenía columna booleana propia — estaba hardcodeado a las
-- etapas con clave 'espera_entrega' y 'entregada' en el código. Se replica igual.
INSERT INTO reglas_etapa (tenant_id, etapa_id, campo, etiqueta, mensaje_ayuda, color, bloquea_cambio_etapa, orden)
SELECT e.tenant_id, e.id, 'alistamiento', 'Sin alistamiento', 'No se encontró una orden UMA de alistamiento. Vincúlala o créala en Servicio Técnico.', '#dc2626', FALSE, 1
FROM etapas_pipeline e WHERE e.clave IN ('espera_entrega', 'entregada')
ON CONFLICT (etapa_id, campo) DO NOTHING;
