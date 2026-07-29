-- v102: Corrige permisos faltantes en clientes_pagos
--
-- La migración v66 creó la tabla con RLS pero nunca le agregó el GRANT
-- correspondiente — sin eso, Postgres niega el acceso incluso con las
-- políticas de RLS bien puestas (el GRANT es la puerta de entrada, RLS
-- filtra después). Esto hacía que la pestaña "Pagos" de la ficha del
-- cliente nunca haya podido leer ni guardar nada en producción.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clientes_pagos TO anon, authenticated, service_role;
