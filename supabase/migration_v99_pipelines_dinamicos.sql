-- v99: Pipelines y etapas dinámicas por tenant — FASE 1 (fundación)
--
-- Esta migración es puramente ADITIVA: crea tablas nuevas y las llena con una
-- copia exacta de la configuración actual (misma que vive hoy hardcodeada en
-- src/lib/ventas/pipeline.ts y en PIPELINE_VENTAS/PIPELINE_POSTVENTA dentro de
-- PipelineKanban.tsx). NO modifica la columna clientes.etapa_venta, NO toca su
-- CHECK constraint, y el Kanban/Vista Lista actuales siguen funcionando exactamente
-- igual que hoy (siguen leyendo del archivo TypeScript, no de estas tablas).
--
-- El objetivo de esta fase es solo tener la base de datos + el panel de
-- administración listos. La migración del Kanban para que LEA de aquí es una
-- fase posterior, separada.

-- ─── Tabla: pipelines_venta ────────────────────────────────────────────────────
-- Reemplaza el concepto de "Pipeline Ventas" / "Pipeline Post-Venta" (pestañas)

CREATE TABLE IF NOT EXISTS pipelines_venta (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clave       TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_pipelines_venta_tenant ON pipelines_venta(tenant_id);

ALTER TABLE pipelines_venta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_pipelines_venta_all" ON pipelines_venta;
CREATE POLICY "tenant_pipelines_venta_all" ON pipelines_venta
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pipelines_venta TO anon, authenticated, service_role;


-- ─── Tabla: pipeline_grupos ────────────────────────────────────────────────────
-- Reemplaza los "grupos" de columnas del Kanban (ej: "Prospectos", "En Proceso")

CREATE TABLE IF NOT EXISTS pipeline_grupos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id  UUID NOT NULL REFERENCES pipelines_venta(id) ON DELETE CASCADE,
  clave        TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#2563EB',
  orden        INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pipeline_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_grupos_tenant   ON pipeline_grupos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_grupos_pipeline ON pipeline_grupos(pipeline_id);

ALTER TABLE pipeline_grupos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_pipeline_grupos_all" ON pipeline_grupos;
CREATE POLICY "tenant_pipeline_grupos_all" ON pipeline_grupos
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pipeline_grupos TO anon, authenticated, service_role;


-- ─── Tabla: etapas_pipeline ────────────────────────────────────────────────────
-- Reemplaza el array ETAPAS + los arrays especiales (ETAPAS_NECESITAN_*, etc.)
-- convertidos en flags booleanos por etapa.

CREATE TABLE IF NOT EXISTS etapas_pipeline (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id                   UUID NOT NULL REFERENCES pipelines_venta(id) ON DELETE CASCADE,
  grupo_id                      UUID REFERENCES pipeline_grupos(id) ON DELETE SET NULL,
  clave                         TEXT NOT NULL,
  label                         TEXT NOT NULL,
  color                         TEXT NOT NULL DEFAULT '#2563EB',
  bg                            TEXT NOT NULL DEFAULT 'bg-blue-50',
  border                        TEXT NOT NULL DEFAULT 'border-blue-500',
  orden                         INTEGER NOT NULL DEFAULT 0,

  -- Comportamiento (reemplazan los arrays ETAPAS_* y comparaciones hardcodeadas)
  es_activa                     BOOLEAN NOT NULL DEFAULT TRUE,   -- cuenta como "lead vivo" (antes ETAPAS_ACTIVAS)
  es_lead                       BOOLEAN NOT NULL DEFAULT FALSE,  -- exige celular (antes ETAPAS_LEADS)
  es_etapa_inicial              BOOLEAN NOT NULL DEFAULT FALSE,  -- a dónde caen los mensajes nuevos
  es_ganado                     BOOLEAN NOT NULL DEFAULT FALSE,  -- dispara fecha_cierre
  es_perdido                    BOOLEAN NOT NULL DEFAULT FALSE,  -- dispara fecha_cierre
  requiere_celular               BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_placa                 BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_fecha_entrega         BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_carta_negociacion     BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_factura                BOOLEAN NOT NULL DEFAULT FALSE,
  requiere_aprobacion_gerencia    BOOLEAN NOT NULL DEFAULT FALSE, -- bloqueada hasta aprobar matrícula

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_etapas_pipeline_tenant   ON etapas_pipeline(tenant_id);
CREATE INDEX IF NOT EXISTS idx_etapas_pipeline_pipeline ON etapas_pipeline(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_etapas_pipeline_grupo    ON etapas_pipeline(grupo_id);

ALTER TABLE etapas_pipeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_etapas_pipeline_all" ON etapas_pipeline;
CREATE POLICY "tenant_etapas_pipeline_all" ON etapas_pipeline
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.etapas_pipeline TO anon, authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- SEMILLA: replica exacta de la configuración actual, para cada tenant existente
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Pipelines
INSERT INTO pipelines_venta (tenant_id, clave, nombre, orden)
SELECT t.id, p.clave, p.nombre, p.orden
FROM tenants t
CROSS JOIN (VALUES
  ('ventas',    'Pipeline Ventas',      0),
  ('postventa', 'Pipeline Post-Venta',  1)
) AS p(clave, nombre, orden)
ON CONFLICT (tenant_id, clave) DO NOTHING;

-- 2) Grupos (columnas agrupadas del Kanban)
INSERT INTO pipeline_grupos (tenant_id, pipeline_id, clave, nombre, color, orden)
SELECT t.id, pv.id, g.clave, g.nombre, g.color, g.orden
FROM tenants t
CROSS JOIN (VALUES
  ('ventas',    'prospectos',  'Prospectos',                0, '#2563EB'),
  ('ventas',    'proceso',     'En Proceso',                 1, '#7C3AED'),
  ('ventas',    'vendida',     'Vendida/Carta Aprobación',   2, '#16A34A'),
  ('ventas',    'entrega',     'Entrega',                    3, '#D97706'),
  ('ventas',    'entregada',   'Entregada',                  4, '#15803D'),
  ('ventas',    'perdido',     'Perdido',                     5, '#DC2626'),
  ('postventa', 'revisiones',  'Post-Venta',                 0, '#4338CA')
) AS g(pipeline_clave, clave, nombre, orden, color)
JOIN pipelines_venta pv ON pv.tenant_id = t.id AND pv.clave = g.pipeline_clave
ON CONFLICT (pipeline_id, clave) DO NOTHING;

-- 3) Etapas (una fila por etapa, con sus flags de comportamiento)
INSERT INTO etapas_pipeline (
  tenant_id, pipeline_id, grupo_id, clave, label, color, bg, border, orden,
  es_activa, es_lead, es_etapa_inicial, es_ganado, es_perdido,
  requiere_celular, requiere_placa, requiere_fecha_entrega,
  requiere_carta_negociacion, requiere_factura, requiere_aprobacion_gerencia
)
SELECT
  t.id, pv.id, pg.id, e.clave, e.label, e.color, e.bg, e.border, e.orden,
  e.es_activa, e.es_lead, e.es_etapa_inicial, e.es_ganado, e.es_perdido,
  e.requiere_celular, e.requiere_placa, e.requiere_fecha_entrega,
  e.requiere_carta_negociacion, e.requiere_factura, e.requiere_aprobacion_gerencia
FROM tenants t
CROSS JOIN (VALUES
  -- pipeline_clave, grupo_clave, clave, label, color, bg, border, orden, es_activa, es_lead, es_etapa_inicial, es_ganado, es_perdido, requiere_celular, requiere_placa, requiere_fecha_entrega, requiere_carta_negociacion, requiere_factura, requiere_aprobacion_gerencia
  ('ventas', 'prospectos', 'nuevo_mensaje',      'Nuevo Contacto - Mensaje',  '#0EA5E9', 'bg-sky-50',      'border-blue-500',   0,  TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE),
  ('ventas', 'prospectos', 'nuevo',              'Nuevo',                     '#2563EB', 'bg-blue-50',     'border-blue-500',   1,  TRUE,  TRUE,  FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE),
  ('ventas', 'prospectos', 'con_interes',        'Con Interés',               '#0891B2', 'bg-cyan-50',     'border-blue-500',   2,  TRUE,  TRUE,  FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE),
  ('ventas', 'prospectos', 'con_objecion',       'Con objeción',              '#DC2626', 'bg-red-50',      'border-blue-500',   3,  TRUE,  TRUE,  FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE),
  ('ventas', 'proceso',    'seguimiento',        'Seguimiento',               '#7E22CE', 'bg-purple-50',   'border-purple-600', 4,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('ventas', 'proceso',    'buscando_credito',   'Buscando Crédito',         '#6B21A8', 'bg-purple-50',   'border-purple-600', 5,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('ventas', 'proceso',    'en_proceso_credito', 'En Proceso de Crédito',     '#581C87', 'bg-purple-100',  'border-purple-600', 6,  TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('ventas', 'vendida',    'ganado',             'Vendida/Carta Aprobación',  '#16A34A', 'bg-green-50',    'border-green-600',  7,  FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE),
  ('ventas', 'entrega',    'aprobado_matricula', 'Aprobados para Matricular', '#B45309', 'bg-amber-50',    'border-green-600',  8,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE),
  ('ventas', 'entrega',    'en_matricula',       'En matrícula',              '#0F766E', 'bg-teal-50',     'border-green-600',  9,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE),
  ('ventas', 'entrega',    'alistamiento',       'Alistamiento',              '#0E7490', 'bg-cyan-50',     'border-green-600',  10, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  FALSE, TRUE,  TRUE,  TRUE),
  ('ventas', 'entrega',    'espera_entrega',     'Espera entrega',            '#0369A1', 'bg-sky-100',     'border-green-600',  11, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('ventas', 'entregada',  'entregada',          'Entregada',                 '#15803D', 'bg-emerald-50',  'border-green-600',  12, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('ventas', 'perdido',    'perdido',            'Cliente Perdido',           '#9CA3AF', 'bg-gray-100',    'border-gray-400',   99, FALSE, FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('postventa', 'revisiones', 'primera_revision',   '1mera Revisión',         '#4338CA', 'bg-indigo-50',   'border-indigo-600', 13, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('postventa', 'revisiones', 'segunda_revision',   '2da Revisión',           '#3730A3', 'bg-indigo-100',  'border-indigo-600', 14, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('postventa', 'revisiones', 'tercera_revision',   '3cera Revisión',         '#312E81', 'bg-indigo-200',  'border-indigo-600', 15, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('postventa', 'revisiones', 'proceso_finalizado', 'Proceso Finalizado',     '#065F46', 'bg-emerald-100', 'border-emerald-700',16, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  TRUE,  TRUE,  TRUE)
) AS e(
  pipeline_clave, grupo_clave, clave, label, color, bg, border, orden,
  es_activa, es_lead, es_etapa_inicial, es_ganado, es_perdido,
  requiere_celular, requiere_placa, requiere_fecha_entrega,
  requiere_carta_negociacion, requiere_factura, requiere_aprobacion_gerencia
)
JOIN pipelines_venta pv ON pv.tenant_id = t.id AND pv.clave = e.pipeline_clave
JOIN pipeline_grupos pg ON pg.pipeline_id = pv.id AND pg.clave = e.grupo_clave
ON CONFLICT (tenant_id, clave) DO NOTHING;
