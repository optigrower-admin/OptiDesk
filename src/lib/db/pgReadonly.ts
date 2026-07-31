import { crearPoolSqlConsole, ejecutarConContextoRLS } from './pgBase'
import type { QueryResult } from 'pg'

// Pool para las consultas de "preview" (Ejecutar en el editor) — muchas
// consultas cortas y concurrentes, timeout corto.
let pool: ReturnType<typeof crearPoolSqlConsole> | null = null
function getPool() {
  if (!pool) pool = crearPoolSqlConsole({ max: 5 })
  return pool
}

export async function ejecutarPreview(usuarioId: string, queryText: string): Promise<QueryResult> {
  return ejecutarConContextoRLS(getPool(), usuarioId, 10_000, queryText)
}
