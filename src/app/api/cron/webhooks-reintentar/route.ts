import { NextResponse } from 'next/server'
import { reintentarPendientes } from '@/lib/webhooks/disparar'

export const dynamic = 'force-dynamic'

// Reintenta entregas de webhook fallidas (backoff 1min/5min/15min, hasta 3 intentos).
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const procesados = await reintentarPendientes()
  return NextResponse.json({ procesados })
}
