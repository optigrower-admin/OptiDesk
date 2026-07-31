import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MIN_POR_MENSAJE_MANUAL = 3 // estimado de minutos que toma redactar/enviar un mensaje a mano

interface Rango { desde: string; hasta: string }
interface Comparado { actual: number; anterior: number }

function calcularTiempoRespuestaMin(mensajes: { conversacion_id: string; direccion: string; created_at: string }[]): number | null {
  const porConversacion = new Map<string, { conversacion_id: string; direccion: string; created_at: string }[]>()
  for (const m of mensajes) {
    const arr = porConversacion.get(m.conversacion_id) ?? []
    arr.push(m)
    porConversacion.set(m.conversacion_id, arr)
  }
  const tiempos: number[] = []
  for (const msgs of porConversacion.values()) {
    msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const primeraEntrante = msgs.find(m => m.direccion === 'entrante')
    if (!primeraEntrante) continue
    const primeraRespuesta = msgs.find(m => m.direccion === 'saliente' && new Date(m.created_at) > new Date(primeraEntrante.created_at))
    if (!primeraRespuesta) continue
    const minutos = (new Date(primeraRespuesta.created_at).getTime() - new Date(primeraEntrante.created_at).getTime()) / 60_000
    if (minutos >= 0 && minutos < 60 * 24 * 7) tiempos.push(minutos) // descarta outliers > 7 días
  }
  if (!tiempos.length) return null
  return tiempos.reduce((a, b) => a + b, 0) / tiempos.length
}

async function calcularMetricasPeriodo(admin: ReturnType<typeof createAdminClient>, tenantId: string, rango: Rango) {
  const [
    { data: mensajes },
    { data: clientesNuevos },
    { data: gananciasHistorial },
    { data: ordenesFinalizadas },
    { count: flujosCompletados },
  ] = await Promise.all([
    admin.from('mensajes')
      .select('conversacion_id, direccion, created_at, enviado_por, tipo')
      .eq('tenant_id', tenantId)
      .gte('created_at', rango.desde).lt('created_at', rango.hasta)
      .neq('tipo', 'nota_interna')
      .limit(5000),
    admin.from('clientes')
      .select('id, etapa_venta', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .gte('created_at', rango.desde).lt('created_at', rango.hasta),
    admin.from('historial_etapas_cliente')
      .select('cliente_id, dias_en_etapa')
      .eq('tenant_id', tenantId)
      .eq('etapa_nueva', 'ganado')
      .gte('created_at', rango.desde).lt('created_at', rango.hasta),
    admin.from('ordenes')
      .select('created_at, fecha_finalizacion')
      .eq('tenant_id', tenantId)
      .in('estado', ['listo', 'pagado', 'finalizado_incompleto'])
      .not('fecha_finalizacion', 'is', null)
      .gte('fecha_finalizacion', rango.desde).lt('fecha_finalizacion', rango.hasta),
    admin.from('flujo_ejecuciones')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('estado', 'completado')
      .gte('created_at', rango.desde).lt('created_at', rango.hasta),
  ])

  const tiempoRespuestaMin = calcularTiempoRespuestaMin((mensajes ?? []) as { conversacion_id: string; direccion: string; created_at: string }[])

  const totalClientesNuevos = clientesNuevos?.length ?? 0
  const clientesGanados = (clientesNuevos ?? []).filter(c => c.etapa_venta === 'ganado').length
  const tasaConversion = totalClientesNuevos > 0 ? clientesGanados / totalClientesNuevos : null

  const ciclos = (gananciasHistorial ?? [])
    .map(g => Number(g.dias_en_etapa))
    .filter(d => !isNaN(d) && d >= 0)
  const cicloVentaDias = ciclos.length ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : null

  const mensajesSalientes = (mensajes ?? []).filter(m => m.direccion === 'saliente')
  const mensajesAutomatizados = mensajesSalientes.filter(m => !m.enviado_por).length
  const mensajesManuales = mensajesSalientes.filter(m => !!m.enviado_por).length
  const horasAhorradasEst = (mensajesAutomatizados * MIN_POR_MENSAJE_MANUAL) / 60

  const duracionesOrdenHoras = (ordenesFinalizadas ?? [])
    .filter(o => o.fecha_finalizacion)
    .map(o => (new Date(o.fecha_finalizacion as string).getTime() - new Date(o.created_at).getTime()) / 3_600_000)
    .filter(h => h >= 0 && h < 24 * 60) // descarta outliers > 60 días
  const ordenTiempoPromedioHoras = duracionesOrdenHoras.length
    ? duracionesOrdenHoras.reduce((a, b) => a + b, 0) / duracionesOrdenHoras.length
    : null

  return {
    tiempoRespuestaMin,
    tasaConversion,
    cicloVentaDias,
    mensajesAutomatizados,
    mensajesManuales,
    horasAhorradasEst,
    flujosCompletados: flujosCompletados ?? 0,
    ordenTiempoPromedioHoras,
  }
}

function combinar(actual: Record<string, number | null>, anterior: Record<string, number | null>): Record<string, Comparado> {
  const out: Record<string, Comparado> = {}
  for (const key of Object.keys(actual)) {
    out[key] = { actual: actual[key] ?? 0, anterior: anterior[key] ?? 0 }
  }
  return out
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['gerencia', 'control_total', 'dueno'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const dias = Math.min(180, Math.max(7, parseInt(req.nextUrl.searchParams.get('dias') ?? '30', 10) || 30))
  const ahora = new Date()
  const inicioActual = new Date(ahora.getTime() - dias * 86_400_000)
  const inicioAnterior = new Date(inicioActual.getTime() - dias * 86_400_000)

  const admin = createAdminClient()
  const [actual, anterior] = await Promise.all([
    calcularMetricasPeriodo(admin, perfil.tenant_id, { desde: inicioActual.toISOString(), hasta: ahora.toISOString() }),
    calcularMetricasPeriodo(admin, perfil.tenant_id, { desde: inicioAnterior.toISOString(), hasta: inicioActual.toISOString() }),
  ])

  return NextResponse.json({
    dias,
    periodoActual: { desde: inicioActual.toISOString(), hasta: ahora.toISOString() },
    periodoAnterior: { desde: inicioAnterior.toISOString(), hasta: inicioActual.toISOString() },
    metricas: combinar(actual, anterior),
  })
}
