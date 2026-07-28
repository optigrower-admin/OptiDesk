import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ejecutarResumenDiario } from '@/lib/ventas/resumenDiario'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resultado = await ejecutarResumenDiario(createAdminClient())

  console.log(`[cron/resumen-diario] Usuarios notificados ${resultado.usuariosNotificados} · WhatsApp ${resultado.whatsappEnviados} · Emails ${resultado.emailsEnviados} · Emails fallidos ${resultado.emailsFallidos}`)
  return NextResponse.json(resultado)
}
