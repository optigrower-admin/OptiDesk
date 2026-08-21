import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { llamarIA } from '@/lib/ia/llamarIA'

const ROLES_EDITA = ['admin', 'gerencia', 'dueno', 'control_total']
const LIMITE_POR_GRUPO = 12       // máximo de conversaciones ganadas / perdidas a analizar
const LIMITE_MENSAJES_POR_CONV = 40 // últimos N mensajes por conversación (acotar tokens)

type MensajeRow = { conversacion_id: string; direccion: string; contenido: string | null; tipo: string; created_at: string }

function formatearTranscripcion(mensajes: MensajeRow[]): string {
  return mensajes
    .filter(m => m.tipo !== 'nota_interna' && m.contenido?.trim())
    .slice(-LIMITE_MENSAJES_POR_CONV)
    .map(m => `${m.direccion === 'entrante' ? 'Cliente' : 'Agente'}: ${m.contenido}`)
    .join('\n')
}

// Analiza conversaciones recientes GANADAS y PERDIDAS de este agente y
// sugiere objeciones nuevas (o mejoras de proceso) — las sugerencias quedan
// PENDIENTES de aprobación de gerencia, nunca se aplican solas al prompt.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  if (!ROLES_EDITA.includes((perfil.rol ?? '').toLowerCase().replace('ñ', 'n'))) {
    return NextResponse.json({ error: 'Solo gerencia puede analizar el agente' }, { status: 403 })
  }
  const tenantId = perfil.tenant_id as string

  const admin = createAdminClient()
  const { data: agente } = await admin.from('agentes_ia').select('id').eq('id', params.id).eq('tenant_id', tenantId).maybeSingle()
  if (!agente) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })

  // Identificar qué etapas del pipeline cuentan como "perdida" / "ganada"
  // (son configurables por tenant, no un valor fijo — ver Config Ventas → Pipelines).
  const { data: etapas } = await admin.from('etapas_pipeline')
    .select('clave, es_perdido, es_ganado, es_matricula').eq('tenant_id', tenantId)
  const clavesPerdidas = (etapas ?? []).filter(e => e.es_perdido).map(e => e.clave)
  const clavesGanadas = (etapas ?? []).filter(e => e.es_ganado || e.es_matricula).map(e => e.clave)

  const sesentaDiasAtras = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: perdidos }, { data: ganados }] = await Promise.all([
    clavesPerdidas.length
      ? admin.from('clientes').select('id, nombre, motivo_perdida').eq('tenant_id', tenantId)
          .in('etapa_venta', clavesPerdidas).gte('updated_at', sesentaDiasAtras)
          .order('updated_at', { ascending: false }).limit(LIMITE_POR_GRUPO)
      : Promise.resolve({ data: [] }),
    clavesGanadas.length
      ? admin.from('clientes').select('id, nombre').eq('tenant_id', tenantId)
          .in('etapa_venta', clavesGanadas).gte('updated_at', sesentaDiasAtras)
          .order('updated_at', { ascending: false }).limit(LIMITE_POR_GRUPO)
      : Promise.resolve({ data: [] }),
  ])

  const clienteIds = [...(perdidos ?? []).map(c => c.id), ...(ganados ?? []).map(c => c.id)]
  if (!clienteIds.length) {
    return NextResponse.json({ ok: true, sugerencias: [], nota: 'No hay clientes ganados/perdidos recientes para analizar (últimos 60 días).' })
  }

  const { data: convs } = await admin.from('conversaciones').select('id, cliente_id').in('cliente_id', clienteIds)
  const convIdPorCliente = new Map<string, string>()
  for (const c of convs ?? []) if (!convIdPorCliente.has(c.cliente_id)) convIdPorCliente.set(c.cliente_id, c.id)

  const todasConvIds = [...convIdPorCliente.values()]
  const { data: mensajes } = todasConvIds.length
    ? await admin.from('mensajes').select('conversacion_id, direccion, contenido, tipo, created_at')
        .in('conversacion_id', todasConvIds).order('created_at', { ascending: true })
    : { data: [] }

  const mensajesPorConv = new Map<string, MensajeRow[]>()
  for (const m of (mensajes ?? []) as MensajeRow[]) {
    if (!mensajesPorConv.has(m.conversacion_id)) mensajesPorConv.set(m.conversacion_id, [])
    mensajesPorConv.get(m.conversacion_id)!.push(m)
  }

  const bloques: string[] = []
  let analizadas = 0
  for (const c of perdidos ?? []) {
    const convId = convIdPorCliente.get(c.id)
    const transcripcion = convId ? formatearTranscripcion(mensajesPorConv.get(convId) ?? []) : ''
    if (!transcripcion) continue
    bloques.push(`### Conversación PERDIDA${c.motivo_perdida ? ` (motivo registrado: ${c.motivo_perdida})` : ''}\n${transcripcion}`)
    analizadas++
  }
  for (const c of ganados ?? []) {
    const convId = convIdPorCliente.get(c.id)
    const transcripcion = convId ? formatearTranscripcion(mensajesPorConv.get(convId) ?? []) : ''
    if (!transcripcion) continue
    bloques.push(`### Conversación GANADA\n${transcripcion}`)
    analizadas++
  }

  if (!bloques.length) {
    return NextResponse.json({ ok: true, sugerencias: [], nota: 'Los clientes recientes ganados/perdidos no tienen conversación de chat asociada.' })
  }

  const prompt = [
    'Eres un analista de ventas revisando conversaciones de WhatsApp entre un agente de IA de ventas de motos y clientes reales.',
    'Cada conversación está marcada como GANADA (el cliente avanzó/compró) o PERDIDA (no siguió).',
    'Identifica objeciones recurrentes de los CLIENTES y evalúa cómo las manejó el AGENTE — si la objeción llevó a que el cliente se perdiera, la respuesta probablemente no funcionó bien; si aun así avanzó, funcionó.',
    'Sugiere hasta 5 objeciones concretas con una MEJOR respuesta sugerida (specífica, en español, tono cordial colombiano), y hasta 2 sugerencias generales de proceso si detectas un patrón claro (ej. "el agente no pregunta contado/financiado").',
    'No inventes objeciones que no aparezcan en las conversaciones. Si una objeción ya se manejó bien en las conversaciones ganadas, no la incluyas.',
    '',
    'Responde EXCLUSIVAMENTE con un JSON válido (sin \`\`\`, sin texto antes o después) con esta forma exacta:',
    '{"objeciones":[{"objecion":"texto corto de la objeción","respuesta":"respuesta sugerida","motivo":"por qué, en una línea"}],"proceso":[{"sugerencia":"texto","motivo":"por qué"}]}',
    'Si no hay nada útil que sugerir, responde {"objeciones":[],"proceso":[]}.',
    '',
    ...bloques,
  ].join('\n')

  const resultado = await llamarIA(tenantId, 'analisis_conversaciones_agente', prompt, {
    proveedor: 'OPENAI', modelo: 'gpt-4o-mini', maxTokens: 1500, temperatura: 0.4,
  })
  if (!resultado.ok || !resultado.texto) {
    return NextResponse.json({ error: resultado.error ?? 'No se pudo analizar (revisa que el uso "analisis_conversaciones_agente" esté activo en Integraciones IA)' }, { status: 500 })
  }

  let parsed: { objeciones?: { objecion: string; respuesta: string; motivo?: string }[]; proceso?: { sugerencia: string; motivo?: string }[] }
  try {
    const limpio = resultado.texto.trim().replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '')
    parsed = JSON.parse(limpio)
  } catch {
    return NextResponse.json({ error: 'La IA no devolvió un JSON válido. Intenta de nuevo.' }, { status: 500 })
  }

  const filas: { tenant_id: string; agente_id: string; tipo: string; objecion: string | null; respuesta: string; motivo: string | null; conversaciones_analizadas: number }[] = []
  for (const o of parsed.objeciones ?? []) {
    if (!o.objecion?.trim() || !o.respuesta?.trim()) continue
    filas.push({ tenant_id: tenantId, agente_id: params.id, tipo: 'objecion', objecion: o.objecion.trim(), respuesta: o.respuesta.trim(), motivo: o.motivo?.trim() ?? null, conversaciones_analizadas: analizadas })
  }
  for (const p of parsed.proceso ?? []) {
    if (!p.sugerencia?.trim()) continue
    filas.push({ tenant_id: tenantId, agente_id: params.id, tipo: 'proceso', objecion: null, respuesta: p.sugerencia.trim(), motivo: p.motivo?.trim() ?? null, conversaciones_analizadas: analizadas })
  }

  if (!filas.length) return NextResponse.json({ ok: true, sugerencias: [] })

  const { data: insertadas, error } = await admin.from('agente_sugerencias').insert(filas)
    .select('id, tipo, objecion, respuesta, motivo, estado, conversaciones_analizadas, created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, sugerencias: insertadas ?? [] })
}
