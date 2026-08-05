-- v150: Calendario del portal Profesional (mecánicos) — bloqueos de horario
-- por mecánico (almuerzo y otros), recurrentes por día de semana o puntuales
-- para una fecha específica. Las citas en sí ya existen (ordenes.fecha_programada
-- + duracion_estimada_horas + mecanico_id) — esta tabla solo agrega los
-- huecos de NO disponibilidad que cada mecánico define para sí mismo.

CREATE TABLE IF NOT EXISTS mecanico_bloqueos_horario (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('recurrente', 'puntual')),
  dia_semana  SMALLINT CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo..6=sábado — solo si tipo='recurrente'
  fecha       DATE, -- solo si tipo='puntual'
  hora_inicio TIME NOT NULL,
  hora_fin    TIME NOT NULL,
  motivo      TEXT NOT NULL DEFAULT 'Almuerzo',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (tipo = 'recurrente' AND dia_semana IS NOT NULL AND fecha IS NULL) OR
    (tipo = 'puntual' AND fecha IS NOT NULL AND dia_semana IS NULL)
  ),
  CHECK (hora_fin > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_mecanico_bloqueos_usuario ON mecanico_bloqueos_horario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_mecanico_bloqueos_tenant ON mecanico_bloqueos_horario(tenant_id);

ALTER TABLE mecanico_bloqueos_horario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mecanico_bloqueos_horario_rls" ON mecanico_bloqueos_horario;
CREATE POLICY "mecanico_bloqueos_horario_rls" ON mecanico_bloqueos_horario
  FOR ALL USING (
    tenant_id = get_user_tenant_id()
    AND (usuario_id = auth.uid() OR get_user_role() IN ('gerencia', 'dueno', 'control_total', 'admin'))
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id()
    AND (usuario_id = auth.uid() OR get_user_role() IN ('gerencia', 'dueno', 'control_total', 'admin'))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mecanico_bloqueos_horario TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mecanico_bloqueos_horario TO service_role;
