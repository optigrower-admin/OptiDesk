import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generarResumenManual } from '@/lib/mensajeria/historial'

// Genera (o actualiza) el resumen de una conversación a pedido explícito de
// gerencia — a diferencia del resumen automático del agente/flujos, esto
// SIEMPRE hace una llamada a IA, por eso queda restringido a gerencia.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  if (perfil.rol !== 'gerencia') return NextResponse.json({ error: 'Solo gerencia puede generar el resumen' }, { status: 403 })

  const { conversacion_id } = await req.json() as { conversacion_id?: string }
  if (!conversacion_id) return NextResponse.json({ error: 'Falta conversacion_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: conv } = await admin.from('conversaciones').select('id').eq('id', conversacion_id).eq('tenant_id', perfil.tenant_id).maybeSingle()
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  const resultado = await generarResumenManual(admin, perfil.tenant_id, conversacion_id)
  if (!resultado.ok) return NextResponse.json({ error: resultado.error ?? 'No se pudo generar el resumen' }, { status: 500 })
  return NextResponse.json({ resumen: resultado.resumen })
}
