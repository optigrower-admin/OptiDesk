import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { procesarEjecucionesPendientes, iniciarFlujoParaConversacion } from '@/lib/mensajeria/flow-executor'

export const maxDuration = 60

// POST /api/admin/flujos/ejecutar
// Dos usos:
//   1. Cron (body vacío): procesa todas las ejecuciones pendientes con delay vencido
//   2. Manual (body con conversacion_id + trigger_tipo): inicia un flujo para una conversación
export async function POST(req: NextRequest) {
  // Verificar secret para el cron de Vercel
  const authHeader = req.headers.get('Authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET ?? ''}`

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isCron && !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body vacío = cron */ }

  // ── Modo cron: procesar ejecuciones con delay vencido ────────────────────
  if (isCron || !body.conversacion_id) {
    const procesadas = await procesarEjecucionesPendientes()
    return NextResponse.json({ ok: true, procesadas })
  }

  // ── Modo manual: iniciar flujo para una conversación específica ──────────
  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user!.id).single()

  if (!perfil?.tenant_id) {
    return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })
  }

  const conversacionId = String(body.conversacion_id)
  const triggerTipo    = String(body.trigger_tipo ?? 'mensaje_nuevo')
  const clienteId      = body.cliente_id ? String(body.cliente_id) : null

  // Verificar que la conversación pertenece al tenant
  const { data: conv } = await supabase
    .from('conversaciones').select('id, cliente_id')
    .eq('id', conversacionId).eq('tenant_id', perfil.tenant_id).maybeSingle()

  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  await iniciarFlujoParaConversacion(
    perfil.tenant_id,
    conversacionId,
    clienteId ?? conv.cliente_id,
    triggerTipo as 'mensaje_nuevo' | 'lead_ad' | 'sin_respuesta_24h' | 'etapa_cambiada' | 'nuevo_cliente'
  )

  return NextResponse.json({ ok: true, message: 'Flujo iniciado' })
}

// GET: estado de ejecuciones activas del tenant (para el dashboard de automatizaciones)
export async function GET(_req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })

  const { data: ejecuciones } = await supabase
    .from('flujo_ejecuciones')
    .select(`
      id, estado, nodo_actual_id, pasos_ejecutados, proxima_ejecucion_at,
      ultimo_error, created_at, updated_at,
      flujos_automatizacion(nombre),
      conversaciones(canal, canal_contact_id, clientes(nombre))
    `)
    .eq('tenant_id', perfil.tenant_id)
    .order('updated_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ ejecuciones: ejecuciones ?? [] })
}
