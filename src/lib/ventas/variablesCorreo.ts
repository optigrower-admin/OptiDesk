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

function normalizar(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(RANGO_TILDES, '')
}

export function reemplazarVariablesCorreo(texto: string, datos: DatosVariablesCorreo): string {
  const porClaveNormalizada = new Map<string, string | undefined>()
  for (const v of VARIABLES_CORREO) porClaveNormalizada.set(normalizar(v.clave), datos[v.clave])

  return texto.replace(/\{([^{}]+)\}/g, (match, contenido: string) => {
    const valor = porClaveNormalizada.get(normalizar(contenido))
    return valor && valor.trim() ? valor : match
  })
}
