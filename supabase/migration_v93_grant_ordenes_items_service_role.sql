-- Migration v93: Otorgar permisos service_role a tablas que el bot de WhatsApp necesita
-- El bot usa createAdminClient() (service_role key), que bypasa RLS pero aún
-- necesita GRANT explícito en tablas que no lo tienen por defecto.

GRANT ALL ON TABLE public.ordenes TO service_role;
GRANT ALL ON TABLE public.ordenes TO postgres;

GRANT ALL ON TABLE public.items_orden TO service_role;
GRANT ALL ON TABLE public.items_orden TO postgres;
