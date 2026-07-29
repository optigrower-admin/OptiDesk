-- v105: Rol "Freelancer" — acceso restringido + bloqueo de edición por etapa
--
-- 1) Amplía los CHECK constraints de rol para aceptar 'freelancer', siguiendo
--    exactamente el mismo patrón usado para agregar 'dueno' (migration_v57).
--
-- 2) Siembra en permisos_roles, para CADA tenant existente, que el rol
--    freelancer solo vea 3 secciones: "ventas" (que ya agrupa Pipeline,
--    Resumen y Actividades), "dashboard_ventas_vehiculos" y "lista_motos".
--    Todo lo demás queda con habilitado=false explícito — el default de
--    tienePermiso() es "true" cuando no hay fila, así que sin esto un
--    freelancer vería el menú completo.
--
-- 3) Tabla nueva etapas_bloqueo_rol: qué roles NO pueden editar/mover clientes
--    que estén en una etapa dada (de ahí en adelante queda de solo lectura
--    para ese rol, aunque la siga viendo en el Kanban). Se siembra para
--    freelancer en las etapas "Aprobados para Matricular" en adelante
--    (incluye todo el pipeline de posventa), replicando la regla de negocio
--    pedida: un freelancer deja de poder tocar el cliente una vez pasa de
--    "Vendida/Carta Aprobación".

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'control_total', 'dueno', 'freelancer'));

ALTER TABLE permisos_roles DROP CONSTRAINT IF EXISTS permisos_roles_rol_check;
ALTER TABLE permisos_roles ADD CONSTRAINT permisos_roles_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'dueno', 'freelancer'));

-- ─── Secciones ocultas para freelancer (todo menos ventas/dashboard-ventas-vehiculos/lista_motos) ──

INSERT INTO permisos_roles (tenant_id, rol, seccion, habilitado, orden)
SELECT t.id, 'freelancer', s.seccion, false, s.orden
FROM tenants t
CROSS JOIN (VALUES
  ('dashboard_servicio_tecnico', 5), ('dashboard_repuestos', 6),
  ('servicio_tecnico', 10), ('repuestos', 20), ('inventario', 30), ('caja', 35),
  ('clientes', 40), ('motos', 50), ('cotizaciones_servtec', 55), ('config_servicio', 85),
  ('config_ventas', 56),
  ('mensajes_bandeja', 100), ('mensajes_conexion', 110), ('mensajes_plantillas', 120), ('mensajes_flujos', 130),
  ('comentarios', 200),
  ('reportes', 60), ('auditoria', 70), ('mi_equipo', 80)
) AS s(seccion, orden)
ON CONFLICT (tenant_id, rol, seccion) DO NOTHING;

INSERT INTO permisos_roles (tenant_id, rol, seccion, habilitado, orden)
SELECT t.id, 'freelancer', s.seccion, true, s.orden
FROM tenants t
CROSS JOIN (VALUES
  ('ventas', 55), ('dashboard_ventas_vehiculos', 7), ('lista_motos', 57)
) AS s(seccion, orden)
ON CONFLICT (tenant_id, rol, seccion) DO NOTHING;

-- ─── Tabla: etapas_bloqueo_rol ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS etapas_bloqueo_rol (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  etapa_id    UUID NOT NULL REFERENCES etapas_pipeline(id) ON DELETE CASCADE,
  rol         TEXT NOT NULL CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'dueno', 'freelancer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(etapa_id, rol)
);

CREATE INDEX IF NOT EXISTS idx_etapas_bloqueo_rol_tenant ON etapas_bloqueo_rol(tenant_id);
CREATE INDEX IF NOT EXISTS idx_etapas_bloqueo_rol_etapa  ON etapas_bloqueo_rol(etapa_id);

ALTER TABLE etapas_bloqueo_rol ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_etapas_bloqueo_rol_all" ON etapas_bloqueo_rol;
CREATE POLICY "tenant_etapas_bloqueo_rol_all" ON etapas_bloqueo_rol
  FOR ALL
  USING     (tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()))
  WITH CHECK(tenant_id = (SELECT tenant_id FROM usuarios WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.etapas_bloqueo_rol TO anon, authenticated, service_role;

-- Semilla: freelancer queda en solo-lectura desde "Aprobados para Matricular"
-- en adelante (incluye todo el pipeline de posventa), en TODOS los tenants.
INSERT INTO etapas_bloqueo_rol (tenant_id, etapa_id, rol)
SELECT e.tenant_id, e.id, 'freelancer'
FROM etapas_pipeline e
WHERE e.clave IN (
  'aprobado_matricula', 'en_matricula', 'alistamiento', 'espera_entrega', 'entregada',
  'primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado'
)
ON CONFLICT (etapa_id, rol) DO NOTHING;
