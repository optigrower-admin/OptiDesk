import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarMensajeDirecto } from '@/lib/mensajeria/flow-executor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Corre una vez al día (límite del plan de Vercel): avanza cada suscripción
// activa cuya proxima_ejecucion_at ya venció, envía el mensaje del paso
// actual, y agenda el siguiente paso (o desactiva la suscripción si ya no
// quedan más mensajes en la secuencia).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const ahora = new Date().toISOString()

  const { data: pendientes } = await admin
    .from('secuencia_suscripciones')
    .select('id, tenant_id, secuencia_id, cliente_id, conversacion_id, paso_actual')
    .eq('activa', true)
    .lte('proxima_ejecucion_at', ahora)
    .limit(200)

  let enviados = 0
  const errores: string[] = []

  for (const sus of pendientes ?? []) {
    try {
      const { data: pasos } = await admin
        .from('secuencia_mensajes')
        .select('contenido, dias_despues, orden')
        .eq('secuencia_id', sus.secuencia_id)
        .order('orden')

      const paso = (pasos ?? [])[sus.paso_actual]
      if (!paso) {
        await admin.from('secuencia_suscripciones').update({ activa: false }).eq('id', sus.id)
        continue
      }

      if (sus.conversacion_id) {
        const { data: cliente } = await admin.from('clientes').select('nombre, recibe_transmisiones').eq('id', sus.cliente_id).maybeSingle()
        if (cliente?.recibe_transmisiones !== false) {
          const texto = paso.contenido.replace(/\{\{nombre\}\}/gi, cliente?.nombre ?? 'Cliente')
          await enviarMensajeDirecto(admin, sus.tenant_id, sus.conversacion_id, texto, 'texto')
          enviados++
        }
      }

      const siguientePaso = (pasos ?? [])[sus.paso_actual + 1]
      if (siguientePaso) {
        const proxima = new Date(Date.now() + (siguientePaso.dias_despues ?? 0) * 86_400_000).toISOString()
        await admin.from('secuencia_suscripciones').update({ paso_actual: sus.paso_actual + 1, proxima_ejecucion_at: proxima }).eq('id', sus.id)
      } else {
        await admin.from('secuencia_suscripciones').update({ activa: false }).eq('id', sus.id)
      }
    } catch (e) {
      errores.push(`${sus.id}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return NextResponse.json({ ok: true, enviados, procesados: pendientes?.length ?? 0, errores })
}
