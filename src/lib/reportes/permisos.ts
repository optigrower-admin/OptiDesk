// Determina si un usuario tiene visibilidad de equipo completo para los
// reportes programados (📊 pipeline / 🔧 Servicio Técnico): gerencia, dueño
// y control_total siempre la tienen; admin solo si tiene marcada la opción
// "Ver todo" en Bot Colaboradores (usuarios.reportes_ve_todo).
export function esGerenciaParaReportes(rol: string | null | undefined, reportesVeTodo: boolean | null | undefined): boolean {
  const rolNorm = (rol ?? '').toLowerCase().replace('ñ', 'n')
  if (['gerencia', 'dueno', 'control_total'].includes(rolNorm)) return true
  if (rolNorm === 'admin') return !!reportesVeTodo
  return false
}
