-- Migration v90: Habilitar Supabase Realtime en las tablas de caja
-- para que la página de Caja se actualice automáticamente sin refrescar
-- cuando se registren pagos, gastos, ingresos, ajustes o pagos a proveedor.

ALTER TABLE pagos_orden      REPLICA IDENTITY FULL;
ALTER TABLE pagos_proveedor  REPLICA IDENTITY FULL;
ALTER TABLE gastos_caja      REPLICA IDENTITY FULL;
ALTER TABLE ingresos_caja    REPLICA IDENTITY FULL;
ALTER TABLE ajustes_caja     REPLICA IDENTITY FULL;
ALTER TABLE lava_moto_ordenes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pagos_orden') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pagos_orden;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pagos_proveedor') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pagos_proveedor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'gastos_caja') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gastos_caja;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ingresos_caja') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ingresos_caja;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ajustes_caja') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ajustes_caja;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lava_moto_ordenes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lava_moto_ordenes;
  END IF;
END $$;
