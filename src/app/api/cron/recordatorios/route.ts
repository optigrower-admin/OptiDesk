import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Verify cron secret to avoid unauthorized calls
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const ahora    = new Date().toISOString()

  // Find uncompleted reminders that are due
  const { data: recordatorios, error } = await supabase
    .from('recordatorios')
    .select('id, tenant_id, conversacion_id, nota, asignado_a')
    .eq('completado', false)
    .lte('fecha_recordatorio', ahora)
    .limit(100)

  if (error) {
    console.error('[cron/recordatorios]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!recordatorios?.length) {
    return NextResponse.json({ procesados: 0 })
  }

  // Mark all as completed (notification would be sent via push in a full implementation)
  const ids = recordatorios.map(r => r.id)
  await supabase
    .from('recordatorios')
    .update({ completado: true })
    .in('id', ids)

  console.log(`[cron/recordatorios] Procesados ${ids.length} recordatorios`)

  // Borrar clientes fusionados con más de 48h de antigüedad
  const limite48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { count: borrados } = await supabase
    .from('clientes')
    .delete({ count: 'exact' })
    .not('fusionado_con_id', 'is', null)
    .lt('fusionado_at', limite48h)

  if (borrados) console.log(`[cron/recordatorios] ${borrados} clientes fusionados eliminados`)

  return NextResponse.json({ procesados: ids.length, clientes_borrados: borrados ?? 0 })
}
