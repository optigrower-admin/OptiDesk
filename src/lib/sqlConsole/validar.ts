import { NOMBRES_TABLAS_WHITELIST } from './whitelist'

export interface ResultadoValidacion {
  ok: boolean
  error?: string
  queryConLimite?: string
}

const PALABRAS_PROHIBIDAS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE',
  'CREATE', 'COMMENT', 'CALL', 'DO', 'VACUUM', 'REINDEX', 'REFRESH', 'COPY',
  'MERGE', 'LOCK', 'SECURITY', 'EXECUTE', 'SET',
]

// Coincide "palabra" como token completo (evita falsos positivos como una
// columna llamada "insertado" o un alias "created_by").
function contienePalabraProhibida(sql: string): string | null {
  for (const palabra of PALABRAS_PROHIBIDAS) {
    const re = new RegExp(`(^|[^a-zA-Z0-9_])${palabra}([^a-zA-Z0-9_]|$)`, 'i')
    if (re.test(sql)) return palabra
  }
  return null
}

// Extrae nombres de tabla de forma conservadora buscando después de FROM/JOIN.
function extraerTablasReferenciadas(sql: string): string[] {
  const tablas: string[] = []
  const re = /\b(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql)) !== null) {
    tablas.push(m[1].toLowerCase())
  }
  return tablas
}

/**
 * Valida una query de solo-lectura para el módulo Consultas SQL.
 * `paraPreview`: si es true, fuerza un LIMIT 500 (si el usuario no puso uno menor).
 */
export function validarQuery(
  queryOriginal: string,
  opciones: { paraPreview: boolean; limiteMax: number; tablasPermitidas?: Set<string> },
): ResultadoValidacion {
  const sql = queryOriginal.trim().replace(/;+\s*$/, '')

  if (!sql) return { ok: false, error: 'La consulta está vacía' }

  if (sql.includes(';')) {
    return { ok: false, error: 'No se permite más de una sentencia por consulta' }
  }

  const inicio = sql.trimStart().slice(0, 10).toUpperCase()
  if (!inicio.startsWith('SELECT') && !inicio.startsWith('WITH')) {
    return { ok: false, error: 'Solo se permiten consultas SELECT o WITH ... SELECT' }
  }

  const prohibida = contienePalabraProhibida(sql)
  if (prohibida) {
    return { ok: false, error: `La palabra "${prohibida}" no está permitida en Consultas SQL` }
  }

  const tablasPermitidas = opciones.tablasPermitidas ?? NOMBRES_TABLAS_WHITELIST
  const tablas = extraerTablasReferenciadas(sql)
  const noPermitidas = tablas.filter(t => !tablasPermitidas.has(t))
  if (noPermitidas.length > 0) {
    return { ok: false, error: `Tabla(s) no permitida(s): ${[...new Set(noPermitidas)].join(', ')}` }
  }

  let queryConLimite = sql
  if (opciones.paraPreview) {
    const yaTieneLimit = /\blimit\s+\d+\b/i.test(sql)
    if (!yaTieneLimit) {
      queryConLimite = `SELECT * FROM (${sql}) AS _consulta_sql_console LIMIT ${opciones.limiteMax}`
    } else {
      // Si el usuario puso un LIMIT propio, lo respetamos pero lo topamos igual
      // envolviendo la consulta — evita que alguien ponga LIMIT 999999999.
      queryConLimite = `SELECT * FROM (${sql}) AS _consulta_sql_console LIMIT ${opciones.limiteMax}`
    }
  }

  return { ok: true, queryConLimite }
}
