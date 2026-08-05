import type { createAdminClient } from '@/lib/supabase/admin'
import { generarYEnviarReporte, type ReporteProgramadoRow } from './enviarReporte'

type Supa = ReturnType<typeof createAdminClient>

interface FilaProgramada extends ReporteProgramadoRow {
  hora_envio: string
  frecuencia: 'diario' | 'semanal' | 'mensual'
  dia_semana: number | null
  dia_mes: number | null
  ultima_ejecucion_fecha: string | null
}

function hoyBogota() {
  const bogota = new Date(Date.now() - 5 * 3600_000)
  return {
    fechaYMD: bogota.toISOString().slice(0, 10),
    hora: bogota.getUTCHours(), minuto: bogota.getUTCMinutes(),
    diaSemana: bogota.getUTCDay(), diaMes: bogota.getUTCDate(),
  }
}

// Se espera que corra cada 15 minutos (ver vercel.json) — revisa cada envío
// activo y dispara los que "caen" en la ventana de 15 min actual, según su
// hora configurada, frecuencia y (si aplica) día de semana/mes.
export async function ejecutarReportesDebidos(supabase: Supa): Promise<{ evaluados: number; enviados: number; fallidos: number }> {
  const { fechaYMD, hora, minuto, diaSemana, diaMes } = hoyBogota()
  const minutosAhora = hora * 60 + minuto

  const { data: filas } = await supabase.from('reportes_programados')
    .select('id, tenant_id, usuario_id, tipo_reporte, asunto, canal_correo, canal_whatsapp, hora_envio, frecuencia, dia_semana, dia_mes, periodo, modo_gerencia, ultima_ejecucion_fecha')
    .eq('activo', true)

  let evaluados = 0, enviados = 0, fallidos = 0

  for (const fila of (filas ?? []) as FilaProgramada[]) {
    evaluados++
    if (fila.ultima_ejecucion_fecha === fechaYMD) continue

    const [hEnvio, mEnvio] = fila.hora_envio.split(':').map(Number)
    const minutosEnvio = hEnvio * 60 + mEnvio
    if (minutosAhora < minutosEnvio || minutosAhora >= minutosEnvio + 15) continue

    if (fila.frecuencia === 'semanal' && fila.dia_semana !== diaSemana) continue
    if (fila.frecuencia === 'mensual' && fila.dia_mes !== diaMes) continue

    const resultado = await generarYEnviarReporte(supabase, fila)
    if (resultado.ok) enviados++; else fallidos++

    await supabase.from('reportes_programados').update({ ultima_ejecucion_fecha: fechaYMD }).eq('id', fila.id)
  }

  return { evaluados, enviados, fallidos }
}
