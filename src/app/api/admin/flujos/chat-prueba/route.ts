import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { iniciarFlujoParaConversacion } from '@/lib/mensajeria/flow-executor'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type AdminClient = ReturnType<typeof createAdminClient>

function contactIdPrueba(flujoId: string) {
  return `prueba_flujo_${flujoId}`
}

async function obtenerConversacionPrueba(admin: AdminClient, tenantId: string, flujoId: string) {
  const canalContactId = contactIdPrueba(flujoId)
  const { data: existente } = await admin
    .from('conversaciones')
    .select('id, cliente_id')
    .eq('tenant_id', tenantId).eq('canal', 'manual').eq('canal_contact_id', canalContactId)
    .maybeSingle()
  if (existente) return existente

  const { data: creada } = await admin
    .from('conversaciones')
    .insert({ tenant_id: tenantId, canal: 'manual', canal_contact_id: canalContactId, estado: 'abierta' })
    .select('id, cliente_id')
    .single()
  return creada!
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['admin', 'gerencia', 'control_total'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const flujoId = body?.flujo_id as string | undefined
  const accion = body?.accion as string | undefined
  if (!flujoId) return NextResponse.json({ error: 'Falta flujo_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: flujo } = await admin
    .from('flujos_automatizacion').select('id').eq('id', flujoId).eq('tenant_id', perfil.tenant_id).single()
  if (!flujo) return NextResponse.json({ error: 'Flujo no encontrado' }, { status: 404 })

  const canalContactId = contactIdPrueba(flujoId)

  if (accion === 'reiniciar') {
    const { data: conv } = await admin
      .from('conversaciones').select('id')
      .eq('tenant_id', perfil.tenant_id).eq('canal', 'manual').eq('canal_contact_id', canalContactId)
      .maybeSingle()
    if (conv) {
      await admin.from('flujo_ejecucion_pasos').delete().in(
        'ejecucion_id',
        (await admin.from('flujo_ejecuciones').select('id').eq('conversacion_id', conv.id)).data?.map(e => e.id) ?? [],
      )
      await admin.from('flujo_ejecuciones').delete().eq('conversacion_id', conv.id)
      await admin.from('mensajes').delete().eq('conversacion_id', conv.id)
      await admin.from('conversaciones').delete().eq('id', conv.id)
    }
    return NextResponse.json({ ok: true })
  }

  const conv = await obtenerConversacionPrueba(admin, perfil.tenant_id, flujoId)

  if (accion === 'historial') {
    const { data: mensajes } = await admin
      .from('mensajes')
      .select('id, direccion, contenido, tipo, created_at')
      .eq('conversacion_id', conv.id)
      .order('created_at', { ascending: true })
    return NextResponse.json({ ok: true, conversacion_id: conv.id, mensajes: mensajes ?? [] })
  }

  if (accion === 'mensaje') {
    const texto = String(body?.texto ?? '').trim()
    if (!texto) return NextResponse.json({ error: 'Falta texto' }, { status: 400 })

    const desde = new Date().toISOString()
    const { data: mensajeUsuario } = await admin
      .from('mensajes')
      .insert({ conversacion_id: conv.id, tenant_id: perfil.tenant_id, direccion: 'entrante', tipo: 'texto', contenido: texto, leido_por_asesor: true })
      .select('id, direccion, contenido, tipo, created_at')
      .single()

    await admin.from('conversaciones').update({
      ultimo_mensaje_at: new Date().toISOString(),
      ultimo_mensaje_texto: texto.slice(0, 100),
      ultimo_mensaje_direccion: 'entrante',
    }).eq('id', conv.id)

    // Si ya hay una ejecución activa de ESTE flujo para la conversación de prueba,
    // continuarla (no pasar flujoId) en vez de arrancar una nueva desde el disparador.
    const { data: ejecucionActiva } = await admin
      .from('flujo_ejecuciones')
      .select('id')
      .eq('conversacion_id', conv.id)
      .eq('flujo_id', flujoId)
      .eq('estado', 'activo')
      .maybeSingle()

    try {
      if (ejecucionActiva) {
        await iniciarFlujoParaConversacion(perfil.tenant_id, conv.id, conv.cliente_id, 'mensaje_nuevo')
      } else {
        await iniciarFlujoParaConversacion(perfil.tenant_id, conv.id, conv.cliente_id, 'mensaje_nuevo', flujoId)
      }
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al ejecutar el flujo' }, { status: 500 })
    }

    const { data: nuevos } = await admin
      .from('mensajes')
      .select('id, direccion, contenido, tipo, created_at')
      .eq('conversacion_id', conv.id)
      .gt('created_at', desde)
      .order('created_at', { ascending: true })

    const { data: estadoEjecucion } = await admin
      .from('flujo_ejecuciones')
      .select('estado, ultimo_error, nodo_actual_id, proxima_ejecucion_at')
      .eq('conversacion_id', conv.id)
      .eq('flujo_id', flujoId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      conversacion_id: conv.id,
      respuestas: (nuevos ?? []).filter(m => m.id !== mensajeUsuario?.id),
      estado_ejecucion: estadoEjecucion ?? null,
    })
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
