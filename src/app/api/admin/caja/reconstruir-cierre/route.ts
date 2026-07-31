import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { calcularSaldosCaja } from '@/lib/caja/saldos'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/caja/reconstruir-cierre
 *
 * Reconstruye a mano el cierre de un día pasado (por si el cron falló esa
 * noche) — usa el mismo cálculo de saldos, pero cortando el historial de
 * movimientos justo a las 11:45pm (hora Colombia) de la fecha pedida, en
 * vez de "todo el historial hasta ahora".
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['gerencia', 'control_total', 'dueno'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { fecha } = await req.json()
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Falta "fecha" (formato YYYY-MM-DD)' }, { status: 400 })
  }

  const hoyBogota = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)
  if (fecha > hoyBogota) {
    return NextResponse.json({ error: 'No se puede reconstruir una fecha futura' }, { status: 400 })
  }

  // 11:45pm hora Colombia (UTC-5) de la fecha pedida = 04:45 UTC del día siguiente
  const corteUTC = new Date(`${fecha}T23:45:00-05:00`).toISOString()

  const admin = createAdminClient()
  const { porMetodo, saldoCajaFuerte } = await calcularSaldosCaja(admin, perfil.tenant_id, corteUTC)
  const saldosPorCuenta = porMetodo.map(m => ({ metodo_pago_id: m.metodoPagoId, nombre: m.nombre, saldo: m.saldo }))

  const { error } = await admin
    .from('cierres_diarios_caja')
    .upsert(
      { tenant_id: perfil.tenant_id, fecha, saldos_por_cuenta: saldosPorCuenta, saldo_caja_fuerte: saldoCajaFuerte },
      { onConflict: 'tenant_id,fecha' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, fecha })
}
