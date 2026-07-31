-- ============================================================================
-- SETUP MANUAL — Rol de Postgres de solo lectura para "Consultas SQL"
-- ============================================================================
--
-- ESTE SCRIPT NO ES UNA MIGRACIÓN NORMAL. Créa un ROL de Postgres con
-- contraseña propia — algo que las migraciones automáticas de este proyecto
-- nunca hacen. Corre esto UNA SOLA VEZ, a mano, en el SQL Editor del
-- dashboard de Supabase (Project → SQL Editor), conectado como el rol
-- "postgres" (el que ya usas para correr todas las demás migraciones).
--
-- QUÉ HACE:
--   1. Crea el rol optidesk_query_readonly, con LOGIN (se conecta directo a
--      Postgres, no pasa por la API de Supabase) pero SIN permiso de crear
--      tablas/roles, sin BYPASSRLS, sin ser dueño de ninguna tabla — o sea
--      que las políticas RLS de cada tabla (tenant_id = get_user_tenant_id())
--      SÍ se le aplican, igual que a cualquier usuario normal de la app.
--   2. Le da GRANT SELECT únicamente sobre las tablas de la whitelist de
--      negocio (src/lib/sqlConsole/whitelist.ts) — ni una tabla más. Aunque
--      alguien se saltara la validación de la app, Postgres mismo le
--      rechazaría cualquier SELECT sobre una tabla fuera de esta lista, y
--      cualquier INSERT/UPDATE/DELETE/DROP sobre cualquier tabla (no tiene
--      esos permisos ni sobre las de la whitelist).
--   3. Le da permiso de ejecutar get_user_tenant_id()/get_user_role()/
--      auth.uid() — las funciones que usan las políticas RLS para saber de
--      qué tenant y qué rol es el usuario. La app le "presta" la identidad
--      del usuario autenticado a esta conexión (ver src/lib/db/pgReadonly.ts,
--      hace SET LOCAL request.jwt.claims por cada query), así que el RLS
--      real de cada tabla sigue aplicando — este rol nunca ve datos de otro
--      tenant, aunque la conexión física sea "genérica".
--
-- ANTES DE CORRERLO: reemplaza 'CAMBIA_ESTA_CONTRASEÑA_...' por una
-- contraseña fuerte y única (ej. generada con un gestor de contraseñas).
-- Esa contraseña, junto con el host/puerto de tu proyecto (Project Settings
-- → Database → Connection string, modo "Session pooler" recomendado), es lo
-- que vas a pegar como variable de entorno SQL_CONSOLE_DATABASE_URL en
-- Vercel — nunca la dejes escrita en ningún archivo de este repo.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'optidesk_query_readonly') THEN
    CREATE ROLE optidesk_query_readonly WITH LOGIN PASSWORD 'CAMBIA_ESTA_CONTRASEÑA_ANTES_DE_CORRER';
  END IF;
END
$$;

-- Por si el rol ya existía de una corrida anterior: asegurar la contraseña actual.
-- (Descomenta y ajusta si necesitas rotarla más adelante)
-- ALTER ROLE optidesk_query_readonly WITH PASSWORD 'NUEVA_CONTRASEÑA';

-- Nota: no incluimos NOSUPERUSER aquí — el rol "postgres" del SQL Editor de
-- Supabase no es un superusuario real, así que Postgres rechaza cualquier
-- ALTER ROLE que toque el atributo SUPERUSER (incluso para confirmar que NO
-- lo tenga). No hace falta: CREATE ROLE nunca le dio superuser de entrada.
ALTER ROLE optidesk_query_readonly NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO optidesk_query_readonly;
GRANT USAGE ON SCHEMA auth TO optidesk_query_readonly;

GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO optidesk_query_readonly;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO optidesk_query_readonly;
GRANT EXECUTE ON FUNCTION auth.uid() TO optidesk_query_readonly;

-- ── Whitelist de tablas (debe reflejar exactamente src/lib/sqlConsole/whitelist.ts) ──

-- Servicio Técnico
GRANT SELECT ON public.ordenes                  TO optidesk_query_readonly;
GRANT SELECT ON public.pagos_orden              TO optidesk_query_readonly;
GRANT SELECT ON public.medios                   TO optidesk_query_readonly;
GRANT SELECT ON public.manuales_partes          TO optidesk_query_readonly;
GRANT SELECT ON public.pagos_proveedor          TO optidesk_query_readonly;
GRANT SELECT ON public.comentarios_orden        TO optidesk_query_readonly;
GRANT SELECT ON public.cotizaciones_servtec     TO optidesk_query_readonly;

-- Repuestos / Inventario
GRANT SELECT ON public.repuestos_uma            TO optidesk_query_readonly;
GRANT SELECT ON public.repuestos_externos       TO optidesk_query_readonly;
GRANT SELECT ON public.movimientos_inventario   TO optidesk_query_readonly;
GRANT SELECT ON public.proveedores              TO optidesk_query_readonly;

-- Clientes
GRANT SELECT ON public.clientes                 TO optidesk_query_readonly;
GRANT SELECT ON public.clientes_bonos           TO optidesk_query_readonly;
GRANT SELECT ON public.clientes_credito_estudio TO optidesk_query_readonly;
GRANT SELECT ON public.clientes_pasos           TO optidesk_query_readonly;
GRANT SELECT ON public.clientes_pagos           TO optidesk_query_readonly;
GRANT SELECT ON public.clientes_etiquetas       TO optidesk_query_readonly;
GRANT SELECT ON public.comentarios_cliente      TO optidesk_query_readonly;
GRANT SELECT ON public.notas_cliente            TO optidesk_query_readonly;
GRANT SELECT ON public.notas_perfil             TO optidesk_query_readonly;
GRANT SELECT ON public.medios_perfil            TO optidesk_query_readonly;
GRANT SELECT ON public.archivos_cliente         TO optidesk_query_readonly;
GRANT SELECT ON public.cliente_campos_custom    TO optidesk_query_readonly;
GRANT SELECT ON public.entidades_financieras    TO optidesk_query_readonly;
GRANT SELECT ON public.contactos_internos       TO optidesk_query_readonly;

-- Ventas
GRANT SELECT ON public.ventas_motos                TO optidesk_query_readonly;
GRANT SELECT ON public.motos                       TO optidesk_query_readonly;
GRANT SELECT ON public.motos_catalogo              TO optidesk_query_readonly;
GRANT SELECT ON public.motos_catalogo_fotos        TO optidesk_query_readonly;
GRANT SELECT ON public.motos_catalogo_colores      TO optidesk_query_readonly;
GRANT SELECT ON public.historial_propietarios_moto TO optidesk_query_readonly;
GRANT SELECT ON public.historial_etapas            TO optidesk_query_readonly;
GRANT SELECT ON public.historial_etapas_cliente    TO optidesk_query_readonly;
GRANT SELECT ON public.historial_asignaciones      TO optidesk_query_readonly;
GRANT SELECT ON public.recordatorios               TO optidesk_query_readonly;
GRANT SELECT ON public.leads_campana               TO optidesk_query_readonly;
GRANT SELECT ON public.pipelines_venta             TO optidesk_query_readonly;
GRANT SELECT ON public.pipeline_grupos             TO optidesk_query_readonly;
GRANT SELECT ON public.etapas_pipeline             TO optidesk_query_readonly;
GRANT SELECT ON public.bonos                       TO optidesk_query_readonly;
GRANT SELECT ON public.cotizaciones                TO optidesk_query_readonly;

-- Mensajería
GRANT SELECT ON public.conversaciones      TO optidesk_query_readonly;
GRANT SELECT ON public.mensajes            TO optidesk_query_readonly;
GRANT SELECT ON public.plantillas_mensajes TO optidesk_query_readonly;
GRANT SELECT ON public.plantillas_correo   TO optidesk_query_readonly;
GRANT SELECT ON public.config_meta         TO optidesk_query_readonly;
GRANT SELECT ON public.config_mensajeria   TO optidesk_query_readonly;
GRANT SELECT ON public.publicaciones       TO optidesk_query_readonly;
GRANT SELECT ON public.comentarios         TO optidesk_query_readonly;

-- Caja
GRANT SELECT ON public.gastos_caja            TO optidesk_query_readonly;
GRANT SELECT ON public.ingresos_caja          TO optidesk_query_readonly;
GRANT SELECT ON public.ajustes_caja           TO optidesk_query_readonly;
GRANT SELECT ON public.cierres_diarios_caja   TO optidesk_query_readonly;
GRANT SELECT ON public.pagos_colaborador_caja TO optidesk_query_readonly;

-- Documentos
GRANT SELECT ON public.documentos_internos TO optidesk_query_readonly;

-- ============================================================================
-- Verificación rápida (opcional, corre esto después para confirmar):
--   SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'optidesk_query_readonly';
--   -- Debe mostrar: rolsuper=false, rolbypassrls=false, rolcanlogin=true
-- ============================================================================
