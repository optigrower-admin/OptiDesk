// Determina si un usuario tiene visibilidad de equipo completo para UN tipo
// de reporte programado (📊 pipeline o 🔧 Servicio Técnico — cada uno tiene
// su propio interruptor): gerencia, dueño y control_total siempre la
// tienen; admin solo si tiene marcada la opción "Ver todo" de ESE tipo en
// Bot Colaboradores (usuarios.reportes_ve_todo_pipeline / _st). El caller
// debe pasar el valor de la columna correspondiente al tipo de reporte.
export function esGerenciaParaReportes(rol: string | null | undefined, reportesVeTodo: boolean | null | undefined): boolean {
  const rolNorm = (rol ?? '').toLowerCase().replace('ñ', 'n')
  if (['gerencia', 'dueno', 'control_total'].includes(rolNorm)) return true
  if (rolNorm === 'admin') return !!reportesVeTodo
  return false
}
