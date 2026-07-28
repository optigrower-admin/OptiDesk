import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { ejecutarResumenDiario } from '@/lib/ventas/resumenDiario'

// Disparo manual del resumen diario (WhatsApp + correo), para pruebas.
// Solo gerencia/dueño — restringido al tenant del usuario que lo dispara.
// Body opcional { usuarioId } para enviarle el resumen solo a un asesor puntual.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'
  if (!esGerencia) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { usuarioId?: string }

  const resultado = await ejecutarResumenDiario(createAdminClient(), perfil.tenant_id, body.usuarioId)
  return NextResponse.json(resultado)
}
