// Variables disponibles en asunto/cuerpo de plantillas de correo, con sintaxis
// {Variable} (llave simple) — ej. "Solicitud Matrícula ({Placa})".

export const VARIABLES_CORREO: { clave: string; label: string }[] = [
  { clave: 'Nombre',  label: 'Nombre del cliente' },
  { clave: 'Cedula',  label: 'Cédula' },
  { clave: 'Placa',   label: 'Placa' },
  { clave: 'Celular', label: 'Celular' },
  { clave: 'Correo',  label: 'Correo del cliente' },
  { clave: 'Moto',    label: 'Moto de interés' },
  { clave: 'Factura', label: 'Número de factura' },
  { clave: 'Asesor',  label: 'Asesor asignado' },
]

export type DatosVariablesCorreo = Partial<Record<string, string>>

export function reemplazarVariablesCorreo(texto: string, datos: DatosVariablesCorreo): string {
  return texto.replace(/\{(\w+)\}/g, (match, clave: string) => {
    const valor = datos[clave]
    return valor && valor.trim() ? valor : match
  })
}
