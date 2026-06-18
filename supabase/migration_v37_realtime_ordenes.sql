-- Migration v37: Habilitar Supabase Realtime en `ordenes` e `items_orden`
-- para que la lista de servicio técnico se actualice sola (sin refrescar)
-- tanto para admin como para profesional cuando hay inserts/updates/deletes.

ALTER TABLE ordenes REPLICA IDENTITY FULL;
ALTER TABLE items_orden REPLICA IDENTITY FULL;

ALTER publication supabase_realtime ADD TABLE ordenes;
ALTER publication supabase_realtime ADD TABLE items_orden;
