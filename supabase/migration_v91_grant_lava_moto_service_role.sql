-- Migration v91: Otorgar permisos de service_role a tablas que los necesitan
-- Algunas tablas fueron creadas sin el GRANT para service_role, lo que impide
-- que el bot de WhatsApp (createAdminClient / service_role key) pueda consultarlas.

GRANT ALL ON TABLE public.lava_moto_ordenes TO service_role;
GRANT ALL ON TABLE public.lava_moto_ordenes TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lava_moto_ordenes TO authenticated;

GRANT ALL ON TABLE public.metodos_pago TO service_role;
GRANT ALL ON TABLE public.metodos_pago TO postgres;
GRANT SELECT ON TABLE public.metodos_pago TO authenticated;
