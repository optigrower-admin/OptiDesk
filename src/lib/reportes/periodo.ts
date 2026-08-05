export type PeriodoReporte = 'hoy' | 'semana' | 'mes' | 'trimestre' | 'anio'

export const PERIODO_LABEL: Record<PeriodoReporte, string> = {
  hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', trimestre: 'Este trimestre', anio: 'Este año',
}

// Calcula desde/hasta (ISO, UTC) para un período relativo a HOY en hora de
// Bogotá (UTC-5, sin horario de verano).
export function calcularPeriodoReporte(periodo: PeriodoReporte, ahora: Date = new Date()): { desdeISO: string; hastaISO: string } {
  const bogota = new Date(ahora.getTime() - 5 * 3600_000)
  const y = bogota.getUTCFullYear(), m = bogota.getUTCMonth(), d = bogota.getUTCDate()

  let desde: Date, hasta: Date
  if (periodo === 'hoy') {
    desde = new Date(Date.UTC(y, m, d))
    hasta = new Date(Date.UTC(y, m, d, 23, 59, 59, 999))
  } else if (periodo === 'semana') {
    const dow = bogota.getUTCDay() || 7 // lunes=1..domingo=7
    desde = new Date(Date.UTC(y, m, d - dow + 1))
    hasta = new Date(Date.UTC(y, m, d - dow + 7, 23, 59, 59, 999))
  } else if (periodo === 'mes') {
    desde = new Date(Date.UTC(y, m, 1))
    hasta = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999))
  } else if (periodo === 'trimestre') {
    const inicioTrimestre = Math.floor(m / 3) * 3
    desde = new Date(Date.UTC(y, inicioTrimestre, 1))
    hasta = new Date(Date.UTC(y, inicioTrimestre + 3, 0, 23, 59, 59, 999))
  } else {
    desde = new Date(Date.UTC(y, 0, 1))
    hasta = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999))
  }
  // Bogotá → UTC: sumar 5 horas de vuelta
  return {
    desdeISO: new Date(desde.getTime() + 5 * 3600_000).toISOString(),
    hastaISO: new Date(hasta.getTime() + 5 * 3600_000).toISOString(),
  }
}
