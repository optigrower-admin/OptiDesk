import type { SupabaseClient } from '@supabase/supabase-js'

// Horario del taller para calcular espacios — fijo por ahora (no hay
// configuración de horario laboral por tenant todavía).
export const HORA_APERTURA = 8
export const HORA_CIERRE = 18
export const PASO_MINUTOS = 30

export interface OcupacionItem {
  horaInicio: string // "HH:MM"
  horaFin: string    // "HH:MM"
  motivo: string
  origen: 'cita' | 'bloqueo'
}

export interface Slot {
  hora: string // "HH:MM"
  disponible: boolean
}

function horaAMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutosAHora(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, '0')
  const m = (min % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

// Trae, para un mecánico y una fecha (YYYY-MM-DD), sus citas programadas
// ese día + sus bloqueos de horario (almuerzo/otros) que apliquen ese día.
export async function obtenerOcupacionMecanico(
  supabase: SupabaseClient, tenantId: string, mecanicoId: string, fechaYMD: string,
  ordenIdExcluir?: string,
): Promise<OcupacionItem[]> {
  const inicioDia = `${fechaYMD}T00:00:00`
  const finDia = `${fechaYMD}T23:59:59`

  let qOrdenes = supabase.from('ordenes')
    .select('id, numero, placa, cliente, fecha_programada, duracion_estimada_horas')
    .eq('tenant_id', tenantId).eq('mecanico_id', mecanicoId).eq('estado', 'programado')
    .gte('fecha_programada', inicioDia).lte('fecha_programada', finDia)
  if (ordenIdExcluir) qOrdenes = qOrdenes.neq('id', ordenIdExcluir)

  const [{ data: ordenes }, { data: bloqueos }] = await Promise.all([
    qOrdenes,
    supabase.from('mecanico_bloqueos_horario')
      .select('tipo, dia_semana, fecha, hora_inicio, hora_fin, motivo')
      .eq('tenant_id', tenantId).eq('usuario_id', mecanicoId),
  ])

  const diaSemana = new Date(fechaYMD + 'T12:00:00').getDay()
  const items: OcupacionItem[] = []

  for (const o of (ordenes ?? []) as { id: string; numero: number; placa: string | null; cliente: string | null; fecha_programada: string; duracion_estimada_horas: number | null }[]) {
    const inicio = new Date(o.fecha_programada)
    const horaInicio = `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`
    const duracionMin = Math.round((o.duracion_estimada_horas ?? 1) * 60)
    items.push({
      horaInicio, horaFin: minutosAHora(horaAMinutos(horaInicio) + duracionMin),
      motivo: `#${o.numero ?? '—'} ${o.placa ?? ''} · ${o.cliente ?? 'Cliente'}`, origen: 'cita',
    })
  }

  for (const b of (bloqueos ?? []) as { tipo: string; dia_semana: number | null; fecha: string | null; hora_inicio: string; hora_fin: string; motivo: string }[]) {
    const aplica = b.tipo === 'recurrente' ? b.dia_semana === diaSemana : b.fecha === fechaYMD
    if (!aplica) continue
    items.push({ horaInicio: b.hora_inicio.slice(0, 5), horaFin: b.hora_fin.slice(0, 5), motivo: b.motivo, origen: 'bloqueo' })
  }

  return items.sort((a, b) => horaAMinutos(a.horaInicio) - horaAMinutos(b.horaInicio))
}

// Genera los espacios del día (cada PASO_MINUTOS) marcando disponible/ocupado
// según si un servicio de duracionMinutos cabría ahí sin chocar con nada.
export function generarSlots(ocupacion: OcupacionItem[], duracionMinutos: number): Slot[] {
  const slots: Slot[] = []
  const dur = Math.max(PASO_MINUTOS, duracionMinutos)
  for (let m = HORA_APERTURA * 60; m + dur <= HORA_CIERRE * 60; m += PASO_MINUTOS) {
    const inicio = m, fin = m + dur
    const choca = ocupacion.some(o => {
      const oi = horaAMinutos(o.horaInicio), of_ = horaAMinutos(o.horaFin)
      return inicio < of_ && fin > oi
    })
    slots.push({ hora: minutosAHora(inicio), disponible: !choca })
  }
  return slots
}
