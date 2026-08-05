import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ejecutarReportesDebidos } from '@/lib/reportes/scheduler'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resultado = await ejecutarReportesDebidos(createAdminClient())
  console.log(`[cron/reportes-programados] evaluados ${resultado.evaluados} · enviados ${resultado.enviados} · fallidos ${resultado.fallidos}`)
  return NextResponse.json(resultado)
}
