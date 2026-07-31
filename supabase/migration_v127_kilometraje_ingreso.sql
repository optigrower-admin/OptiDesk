-- v127: el kilometraje cambia en cada entrada al taller — hasta ahora solo se
-- guardaba una vez, al crear la moto por primera vez (motos.kilometraje),
-- pero nunca se actualizaba en visitas siguientes. Se agrega:
--   1. ordenes.kilometraje_ingreso — registro histórico del km reportado en
--      CADA orden (queda el historial completo, no solo el último valor).
--   2. una función SECURITY DEFINER para poder actualizar motos.kilometraje
--      desde el flujo de creación de orden aunque quien la cree sea mecánico
--      (mismo patrón que vincular_moto_cliente / actualizar_cliente_orden,
--      migration_v55 — la política RLS de motos solo permite UPDATE directo
--      a admin/gerencia).

ALTER TABLE ordenes ADD COLUMN IF NOT EXISTS kilometraje_ingreso INTEGER;

CREATE OR REPLACE FUNCTION actualizar_kilometraje_moto(p_moto_id UUID, p_kilometraje INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE motos
  SET kilometraje = p_kilometraje
  WHERE id = p_moto_id AND tenant_id = get_user_tenant_id();
END;
$$;

GRANT EXECUTE ON FUNCTION actualizar_kilometraje_moto TO authenticated;
