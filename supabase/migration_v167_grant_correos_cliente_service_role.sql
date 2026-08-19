-- correos_cliente no tenía GRANT explícito para service_role (igual que pasó
-- antes con historial_cambios_cliente) — esto es un respaldo por si algún
-- proceso en el futuro necesita escribir ahí con el cliente de servicio.
-- El código actual ya no depende de esto (usa el cliente autenticado), pero
-- no está de más dejar el permiso correcto.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.correos_cliente TO service_role;
