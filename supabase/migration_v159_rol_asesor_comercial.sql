-- v159: Rol "Asesor Comercial" — acceso restringido a Ventas, igual que
-- Freelancer (migration_v105) pero SIN el módulo de Comisiones (todavía no
-- tiene su propia sección de comisiones) y sin cerrarle la mensajería dentro
-- de la ficha del cliente (es un rol interno, no un contratista externo).
--
-- 1) Amplía los CHECK constraints de rol para aceptar 'asesor_comercial'.
-- 2) Siembra en permisos_roles, para CADA tenant existente, que el rol
--    asesor_comercial solo vea: "ventas", "dashboard_ventas_vehiculos",
--    "lista_motos" y "mi_uso". Todo lo demás queda con habilitado=false
--    explícito (incluida "comisiones_freelance").
-- 3) Bloqueo de edición por etapa: igual que freelancer, queda en
--    solo-lectura desde "Aprobados para Matricular" en adelante.
-- 4) Oculta el pipeline "Post-Venta" para este rol, igual que freelancer.

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'control_total', 'dueno', 'freelancer', 'asesor_comercial'));

ALTER TABLE permisos_roles DROP CONSTRAINT IF EXISTS permisos_roles_rol_check;
ALTER TABLE permisos_roles ADD CONSTRAINT permisos_roles_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'dueno', 'freelancer', 'asesor_comercial'));

ALTER TABLE etapas_bloqueo_rol DROP CONSTRAINT IF EXISTS etapas_bloqueo_rol_rol_check;
ALTER TABLE etapas_bloqueo_rol ADD CONSTRAINT etapas_bloqueo_rol_rol_check
  CHECK (rol IN ('mecanico', 'admin', 'gerencia', 'dueno', 'freelancer', 'asesor_comercial'));

-- ─── Secciones ocultas para asesor_comercial (todo menos ventas/dashboard-ventas-vehiculos/lista_motos/mi_uso) ──

INSERT INTO permisos_roles (tenant_id, rol, seccion, habilitado, orden)
SELECT t.id, 'asesor_comercial', s.seccion, false, s.orden
FROM tenants t
CROSS JOIN (VALUES
  ('dashboard_servicio_tecnico', 5), ('dashboard_repuestos', 6),
  ('servicio_tecnico', 10), ('repuestos', 20), ('inventario', 30), ('caja', 35),
  ('clientes', 40), ('motos', 50), ('cotizaciones_servtec', 55), ('config_servicio', 85),
  ('config_ventas', 56), ('comisiones_freelance', 59),
  ('mensajes_bandeja', 100), ('mensajes_conexion', 110), ('mensajes_plantillas', 120), ('mensajes_flujos', 130),
  ('comentarios', 200),
  ('reportes', 60), ('auditoria', 70), ('mi_equipo', 80)
) AS s(seccion, orden)
ON CONFLICT (tenant_id, rol, seccion) DO NOTHING;

INSERT INTO permisos_roles (tenant_id, rol, seccion, habilitado, orden)
SELECT t.id, 'asesor_comercial', s.seccion, true, s.orden
FROM tenants t
CROSS JOIN (VALUES
  ('ventas', 55), ('dashboard_ventas_vehiculos', 7), ('lista_motos', 57), ('mi_uso', 81)
) AS s(seccion, orden)
ON CONFLICT (tenant_id, rol, seccion) DO NOTHING;

-- ─── Bloqueo por etapa: solo-lectura desde "Aprobados para Matricular" en adelante ──

INSERT INTO etapas_bloqueo_rol (tenant_id, etapa_id, rol)
SELECT e.tenant_id, e.id, 'asesor_comercial'
FROM etapas_pipeline e
WHERE e.clave IN (
  'aprobado_matricula', 'en_matricula', 'alistamiento', 'espera_entrega', 'entregada',
  'primera_revision', 'segunda_revision', 'tercera_revision', 'proceso_finalizado'
)
ON CONFLICT (etapa_id, rol) DO NOTHING;

-- ─── Ocultar pipeline "Post-Venta" para asesor_comercial ───────────────────

UPDATE pipelines_venta
SET roles_ocultos = array_append(roles_ocultos, 'asesor_comercial')
WHERE clave = 'postventa' AND NOT ('asesor_comercial' = ANY(roles_ocultos));
