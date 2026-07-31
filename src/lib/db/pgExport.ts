import { crearPoolSqlConsole, ejecutarConContextoRLS } from './pgBase'
import type { QueryResult } from 'pg'

// Pool separado para exportaciones — queries sin LIMIT que pueden traer
// muchas filas y tardar más, así que se aísla con muy pocas conexiones
// concurrentes (no debe competir con el pool de preview) y un timeout largo.
let pool: ReturnType<typeof crearPoolSqlConsole> | null = null
function getPool() {
  if (!pool) pool = crearPoolSqlConsole({ max: 3 })
  return pool
}

export async function ejecutarExport(usuarioId: string, queryText: string): Promise<QueryResult> {
  return ejecutarConContextoRLS(getPool(), usuarioId, 5 * 60_000, queryText)
}
