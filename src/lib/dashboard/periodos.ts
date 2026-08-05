export type PeriodoPreset = 'hoy' | 'ayer' | '7d' | 'semana' | 'semana_anterior' | '15d' | 'mes' | 'mes_anterior' | 'anio' | 'rango'

export const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  '7d': 'Últimos 7 días',
  semana: 'Esta semana',
  semana_anterior: 'Semana pasada',
  '15d': 'Últimos 15 días',
  mes: 'Este mes',
  mes_anterior: 'Mes anterior',
  anio: 'Año actual',
  rango: 'Rango personalizado',
}

export interface RangoFechas {
  desdeISO: string
  hastaISO: string
}

function inicioDia(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function finDia(d: Date): Date {
  const r = new Date(d)
  r.setHours(23, 59, 59, 999)
  return r
}

/** Calcula el rango [desde, hasta] (ISO, con hora) para un preset de período. */
export function calcularRango(preset: PeriodoPreset, desdeManual?: string, hastaManual?: string): RangoFechas {
  const hoy = new Date()

  if (preset === 'hoy') {
    return { desdeISO: inicioDia(hoy).toISOString(), hastaISO: finDia(hoy).toISOString() }
  }
  if (preset === 'ayer') {
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1)
    return { desdeISO: inicioDia(ayer).toISOString(), hastaISO: finDia(ayer).toISOString() }
  }
  if (preset === '7d') {
    const desde = new Date(hoy); desde.setDate(hoy.getDate() - 6)
    return { desdeISO: inicioDia(desde).toISOString(), hastaISO: finDia(hoy).toISOString() }
  }
  if (preset === 'semana') {
    // Semana completa (lunes a domingo) de la semana actual, según el día de hoy.
    const lunes = new Date(hoy)
    const dia = hoy.getDay() // 0=dom, 1=lun, ...
    lunes.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1))
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    return { desdeISO: inicioDia(lunes).toISOString(), hastaISO: finDia(domingo).toISOString() }
  }
  if (preset === 'semana_anterior') {
    const lunes = new Date(hoy)
    const dia = hoy.getDay()
    lunes.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1) - 7)
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    return { desdeISO: inicioDia(lunes).toISOString(), hastaISO: finDia(domingo).toISOString() }
  }
  if (preset === '15d') {
    const desde = new Date(hoy); desde.setDate(hoy.getDate() - 14)
    return { desdeISO: inicioDia(desde).toISOString(), hastaISO: finDia(hoy).toISOString() }
  }
  if (preset === 'mes') {
    // Mes completo (día 1 al último día) del mes actual, según el día de hoy.
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
    return { desdeISO: inicioDia(primero).toISOString(), hastaISO: finDia(ultimo).toISOString() }
  }
  if (preset === 'mes_anterior') {
    const primeroMesAnt = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    const ultimoMesAnt = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
    return { desdeISO: inicioDia(primeroMesAnt).toISOString(), hastaISO: finDia(ultimoMesAnt).toISOString() }
  }
  if (preset === 'anio') {
    // Año completo (1 de enero al 31 de diciembre) del año actual.
    const primero = new Date(hoy.getFullYear(), 0, 1)
    const ultimo = new Date(hoy.getFullYear(), 11, 31)
    return { desdeISO: inicioDia(primero).toISOString(), hastaISO: finDia(ultimo).toISOString() }
  }
  // rango personalizado
  const desde = desdeManual ? new Date(`${desdeManual}T00:00:00`) : inicioDia(hoy)
  const hasta = hastaManual ? new Date(`${hastaManual}T00:00:00`) : hoy
  return { desdeISO: inicioDia(desde).toISOString(), hastaISO: finDia(hasta).toISOString() }
}

/** Período anterior equivalente (misma duración, inmediatamente antes), para comparativos. */
export function calcularRangoAnterior(rango: RangoFechas): RangoFechas {
  const desde = new Date(rango.desdeISO)
  const hasta = new Date(rango.hastaISO)
  const duracionMs = hasta.getTime() - desde.getTime()
  const hastaAnterior = new Date(desde.getTime() - 1) // justo antes de que empiece el actual
  const desdeAnterior = new Date(hastaAnterior.getTime() - duracionMs)
  return { desdeISO: desdeAnterior.toISOString(), hastaISO: hastaAnterior.toISOString() }
}

export interface Variacion {
  pct: number | null // null cuando no hay base para comparar (anterior = 0 y actual = 0)
  tendencia: 'up' | 'down' | 'flat'
}

export function calcularVariacion(actual: number, anterior: number): Variacion {
  if (anterior === 0) {
    if (actual === 0) return { pct: null, tendencia: 'flat' }
    return { pct: null, tendencia: 'up' }
  }
  const pct = ((actual - anterior) / Math.abs(anterior)) * 100
  return { pct, tendencia: pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat' }
}

/** YYYY-MM-DD en horario local, usado para inputs <input type="date"> y para agrupar series por día. */
export function ymdLocal(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
