import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularSaldosCaja } from '@/lib/caja/saldos'

export const dynamic = 'force-dynamic'

// Corre todos los días a las 11:59pm hora Colombia (vercel.json: "59 4 * * *" UTC,
// ya que Colombia es UTC-5 todo el año, sin horario de verano).
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Fecha local Colombia (America/Bogota, UTC-5 fijo) — no depende del huso
  // horario del servidor donde corre el cron.
  const fecha = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)

  const { data: tenants, error: errTenants } = await admin.from('tenants').select('id').eq('activo', true)
  if (errTenants) return NextResponse.json({ error: errTenants.message }, { status: 500 })

  let procesados = 0
  const errores: { tenantId: string; error: string }[] = []

  for (const t of tenants ?? []) {
    try {
      const { porMetodo, saldoCajaFuerte } = await calcularSaldosCaja(admin, t.id)
      const saldosPorCuenta = porMetodo.map(m => ({ metodo_pago_id: m.metodoPagoId, nombre: m.nombre, saldo: m.saldo }))
      const { error: errUpsert } = await admin
        .from('cierres_diarios_caja')
        .upsert(
          { tenant_id: t.id, fecha, saldos_por_cuenta: saldosPorCuenta, saldo_caja_fuerte: saldoCajaFuerte },
          { onConflict: 'tenant_id,fecha' }
        )
      if (errUpsert) throw new Error(errUpsert.message)
      procesados++
    } catch (e: unknown) {
      errores.push({ tenantId: t.id, error: e instanceof Error ? e.message : 'Error desconocido' })
    }
  }

  console.log(`[cron/cierre-diario-caja] Fecha ${fecha} · Tenants procesados ${procesados}/${(tenants ?? []).length}`)
  return NextResponse.json({ fecha, procesados, total: (tenants ?? []).length, errores })
}
