import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ejecutarResumenDiario } from '@/lib/ventas/resumenDiario'
import { ejecutarResumenPipelineTodos } from '@/lib/ventas/resumenPipelineEmail'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const [resultado, resultadoPipeline] = await Promise.all([
    ejecutarResumenDiario(admin),
    ejecutarResumenPipelineTodos(admin),
  ])

  console.log(`[cron/resumen-diario] Usuarios notificados ${resultado.usuariosNotificados} · WhatsApp ${resultado.whatsappEnviados} · Emails ${resultado.emailsEnviados} · Emails fallidos ${resultado.emailsFallidos}`)
  console.log(`[cron/resumen-diario] Resumen pipeline — enviados ${resultadoPipeline.enviados} · fallidos ${resultadoPipeline.fallidos}`)
  return NextResponse.json({ ...resultado, pipeline: resultadoPipeline })
}
