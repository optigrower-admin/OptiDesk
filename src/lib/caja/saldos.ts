import type { SupabaseClient } from '@supabase/supabase-js'
import { construirMovimientos, CATEGORIAS_CON_CUENTA, TRANSFERENCIA_CAJA_FUERTE } from './movimientos'

export interface SaldoMetodo {
  metodoPagoId: string
  nombre: string
  saldo: number
}

export interface SaldosCaja {
  porMetodo: SaldoMetodo[]
  saldoCajaFuerte: number
}

// Réplica exacta de saldosCuentas/saldoCajaFuerte en admin/caja/page.tsx —
// saldo histórico (sin filtro de fecha) por cuenta y de Caja fuerte. Se usa
// tanto para el cron de cierre diario como para cualquier otra necesidad de
// "saldo actual" fuera de la página de Caja.
export async function calcularSaldosCaja(supabase: SupabaseClient, tenantId: string, hastaISO: string | null = null): Promise<SaldosCaja> {
  const movimientos = await construirMovimientos(supabase, tenantId, null, hastaISO)

  const mapa = new Map<string, SaldoMetodo>()
  let saldoCajaFuerte = 0

  for (const m of movimientos) {
    if (m.categoria === 'gasto' && m.concepto.trim().toLowerCase().startsWith(TRANSFERENCIA_CAJA_FUERTE)) {
      saldoCajaFuerte += Math.abs(m.monto)
    } else if (m.cuentaEspecial === 'caja_fuerte') {
      saldoCajaFuerte += m.monto
    }

    if (!CATEGORIAS_CON_CUENTA.includes(m.categoria)) continue
    if (m.cuentaEspecial === 'caja_fuerte') continue
    const key = m.metodoPagoId ?? 'sin_metodo'
    const nombre = m.metodoPago ?? 'Sin método especificado'
    if (!mapa.has(key)) mapa.set(key, { metodoPagoId: key, nombre, saldo: 0 })
    mapa.get(key)!.saldo += m.monto
  }

  return { porMetodo: [...mapa.values()], saldoCajaFuerte }
}
