import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { ejecutarResumenDiario } from '@/lib/ventas/resumenDiario'

// Disparo manual del resumen diario (WhatsApp + correo), para pruebas desde Config Ventas.
// Solo gerencia/dueño — restringido al tenant del usuario que lo dispara.
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'
  if (!esGerencia) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const resultado = await ejecutarResumenDiario(createAdminClient(), perfil.tenant_id)
  return NextResponse.json(resultado)
}
