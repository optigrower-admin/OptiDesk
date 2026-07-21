import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCfgMeta, enviarWADirecto } from '@/lib/mensajeria/enviar-wa-directo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin empresa' }, { status: 403 })
  if (!['gerencia', 'dueno'].includes(perfil.rol))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { usuarioId } = await req.json() as { usuarioId: string }
  if (!usuarioId) return NextResponse.json({ error: 'Falta usuarioId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: col } = await admin
    .from('usuarios')
    .select('nombre, whatsapp_number')
    .eq('id', usuarioId)
    .eq('tenant_id', perfil.tenant_id)
    .single()

  if (!col?.whatsapp_number)
    return NextResponse.json({ error: 'Sin número configurado' }, { status: 404 })

  const cfg = await getCfgMeta(admin, perfil.tenant_id)
  if (!cfg) return NextResponse.json({ error: 'Sin config WhatsApp' }, { status: 404 })

  const esGerencia = ['gerencia', 'dueno'].includes(
    // obtener rol del colaborador
    ((await admin.from('usuarios').select('rol').eq('id', usuarioId).single()).data as { rol?: string })?.rol ?? ''
  )

  const nombre = (col.nombre as string | null)?.split(' ')[0] ?? ''
  const menu = esGerencia
    ? `¡Hola *${nombre}*! Panel de gerencia:\n\n1. Clientes por etapa (todo el equipo)\n2. Recordatorios pendientes\n3. Buscar cliente\n4. Órdenes activas\n\n_Responde con el número de la opción_`
    : `¡Hola *${nombre}*! ¿Qué necesitas?\n\n1. Mis clientes por etapa\n2. Mis recordatorios pendientes\n3. Buscar cliente\n4. Órdenes activas\n\n_Responde con el número de la opción_`

  const ok = await enviarWADirecto(cfg, col.whatsapp_number as string, menu)
  if (!ok) return NextResponse.json({ error: 'Error al enviar WA' }, { status: 502 })

  return NextResponse.json({ ok: true })
}
