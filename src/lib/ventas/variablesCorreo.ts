// Variables disponibles en asunto/cuerpo de plantillas de correo, con sintaxis
// {Variable} (llave simple) — ej. "Solicitud Matricula ({Placa})". El nombre
// dentro de las llaves puede llevar espacios/tildes libremente (se compara sin
// tildes y sin importar mayusculas), siempre que coincida con una de estas.

export const VARIABLES_CORREO: { clave: string; label: string }[] = [
  { clave: 'Nombre',                label: 'Nombre del cliente' },
  { clave: 'Cedula',                label: 'Cedula' },
  { clave: 'Placa',                 label: 'Placa' },
  { clave: 'Celular',               label: 'Celular' },
  { clave: 'Correo',                label: 'Correo del cliente' },
  { clave: 'Moto',                  label: 'Moto de interes' },
  { clave: 'Factura',               label: 'Numero de factura' },
  { clave: 'Asesor',                label: 'Asesor asignado' },
  { clave: 'Carta de Negociacion',  label: 'Numero de carta de negociacion' },
]

export type DatosVariablesCorreo = Partial<Record<string, string>>

const RANGO_TILDES = new RegExp('[̀-ͯ]', 'g')

export function normalizarVariable(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(RANGO_TILDES, '')
}

// Acepta tanto {Variable} como {{Variable}} (por si alguien escribe llave
// doble por costumbre de otros sistemas) — se consumen todas las llaves
// consecutivas para no dejar llaves sueltas en el resultado.
export function reemplazarVariablesCorreo(texto: string, datos: DatosVariablesCorreo): string {
  const porClaveNormalizada = new Map<string, string | undefined>()
  for (const v of VARIABLES_CORREO) porClaveNormalizada.set(normalizarVariable(v.clave), datos[v.clave])

  return texto.replace(/\{+([^{}]+)\}+/g, (match, contenido: string) => {
    const valor = porClaveNormalizada.get(normalizarVariable(contenido))
    return valor && valor.trim() ? valor : match
  })
}

// Para resaltar en azul las variables reconocidas mientras se escribe una
// plantilla (Config Ventas). Devuelve los tramos de texto ya clasificados.
export type TramoTextoVariable = { texto: string; variable: boolean; reconocida: boolean }
export function partirTextoEnVariables(texto: string): TramoTextoVariable[] {
  const clavesNormalizadas = new Set(VARIABLES_CORREO.map(v => normalizarVariable(v.clave)))
  const tramos: TramoTextoVariable[] = []
  let ultimoIndice = 0
  for (const m of texto.matchAll(/\{+([^{}]+)\}+/g)) {
    const inicio = m.index ?? 0
    if (inicio > ultimoIndice) tramos.push({ texto: texto.slice(ultimoIndice, inicio), variable: false, reconocida: false })
    tramos.push({ texto: m[0], variable: true, reconocida: clavesNormalizadas.has(normalizarVariable(m[1])) })
    ultimoIndice = inicio + m[0].length
  }
  if (ultimoIndice < texto.length) tramos.push({ texto: texto.slice(ultimoIndice), variable: false, reconocida: false })
  return tramos
}
