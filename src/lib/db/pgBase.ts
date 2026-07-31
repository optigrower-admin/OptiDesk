import { Pool, type QueryResult } from 'pg'

// Conexión directa a Postgres para el módulo "Consultas SQL", usando el rol
// optidesk_query_readonly (ver supabase/setup_rol_readonly_sql_console.sql).
// Esta conexión NO pasa por PostgREST, así que Postgres no tiene de forma
// automática el JWT del usuario que normalmente alimenta auth.uid() /
// get_user_tenant_id() / get_user_role() (usadas en las políticas RLS de
// cada tabla). Por eso, antes de correr la query real del usuario, cada
// conexión "presta" esa identidad manualmente con SET LOCAL — dentro de una
// transacción, así que el valor solo aplica a esa query y desaparece al
// hacer COMMIT/ROLLBACK. Con esto, el RLS real de Postgres (no solo la
// whitelist a nivel de app) sigue aislando cada tenant correctamente.

export function crearPoolSqlConsole(opciones: { max: number }): Pool {
  const connectionString = process.env.SQL_CONSOLE_DATABASE_URL
  if (!connectionString) {
    throw new Error('Falta la variable de entorno SQL_CONSOLE_DATABASE_URL')
  }
  return new Pool({
    connectionString,
    max: opciones.max,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 30_000,
  })
}

export async function ejecutarConContextoRLS(
  pool: Pool,
  usuarioId: string,
  statementTimeoutMs: number,
  queryText: string,
): Promise<QueryResult> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const claims = JSON.stringify({ sub: usuarioId })
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claims', claims])
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claim.sub', usuarioId])
    await client.query(`SET LOCAL statement_timeout = ${Math.floor(statementTimeoutMs)}`)
    const resultado = await client.query(queryText)
    await client.query('COMMIT')
    return resultado
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
