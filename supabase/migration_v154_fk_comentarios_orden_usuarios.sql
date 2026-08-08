-- v154: comentarios_orden.usuario_id apuntaba solo a auth.users, no a
-- public.usuarios. Supabase/PostgREST necesita un FK hacia public.usuarios
-- para poder resolver el embed usuarios:usuario_id(nombre) que usa la
-- pantalla de la orden — sin este FK, esa consulta fallaba en silencio y
-- la lista de comentarios siempre volvía vacía (aunque el insert sí
-- funcionaba: los comentarios sí quedaban guardados en la tabla).

ALTER TABLE public.comentarios_orden
  DROP CONSTRAINT IF EXISTS comentarios_orden_usuario_id_fkey;

ALTER TABLE public.comentarios_orden
  ADD CONSTRAINT comentarios_orden_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;
