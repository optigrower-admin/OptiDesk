import { createAdminClient } from '@/lib/supabase/admin'
import { llamarIA } from '@/lib/ia/llamarIA'

type Supa = ReturnType<typeof createAdminClient>

// ─── Trae los últimos mensajes de la conversación como texto plano ───────────
// (contexto crudo para la IA, sin resumir con una llamada extra — más barato)
// Vive en su propio archivo (no en flow-executor.ts) para que tanto el motor
// de flujos como el agente con herramientas puedan importarlo sin crear un
// ciclo de imports entre los dos.
export async function obtenerHistorialConversacion(supabase: Supa, convId: string, limite = 20): Promise<string> {
  const { data: mensajes } = await supabase
    .from('mensajes')
    .select('direccion, contenido, created_at')
    .eq('conversacion_id', convId)
    .order('created_at', { ascending: false })
    .limit(limite)
  if (!mensajes?.length) return ''
  return mensajes
    .slice()
    .reverse()
    .map((m: { direccion: string; contenido: string | null }) => `${m.direccion === 'entrante' ? 'Cliente' : 'Bot'}: ${m.contenido ?? ''}`)
    .join('\n')
}

interface MensajeRow { direccion: string; contenido: string | null; created_at: string }

const VENTANA_RECIENTE = 15
const UMBRAL_RESUMEN = 20

// Modelo económico fijo por proveedor para el resumen — no depende de qué
// modelo tenga configurado el agente/flujo que llama, para no encarecer algo
// que solo necesita condensar texto.
const MODELO_ECONOMICO_RESUMEN: Record<string, string> = {
  OPENAI: 'gpt-4o-mini', ANTHROPIC: 'claude-haiku-4-5-20251001',
  GOOGLE: 'gemini-2.0-flash', GROK: 'grok-2-latest',
}

function formatearMensajes(msgs: MensajeRow[]): string {
  return msgs.map(m => `${m.direccion === 'entrante' ? 'Cliente' : 'Bot'}: ${m.contenido ?? ''}`).join('\n')
}

// ─── Contexto de conversación con resumen automático ──────────────────────────
// Si la conversación tiene 20 mensajes o menos, devuelve el historial crudo
// tal cual (más barato, sin llamada extra a IA). Si supera ese umbral, arma
// [resumen cacheado de lo viejo] + [últimos VENTANA_RECIENTE mensajes
// crudos] — el resumen se regenera SOLO cuando aparecen mensajes viejos
// nuevos que aún no están cubiertos (nunca en cada turno), usando un modelo
// económico fijo.
export async function obtenerContextoConversacion(supabase: Supa, tenantId: string, convId: string): Promise<string> {
  const { count } = await supabase.from('mensajes').select('id', { count: 'exact', head: true }).eq('conversacion_id', convId)
  const total = count ?? 0
  if (total <= UMBRAL_RESUMEN) {
    return obtenerHistorialConversacion(supabase, convId, UMBRAL_RESUMEN)
  }

  const { data: recientesDesc } = await supabase
    .from('mensajes').select('direccion, contenido, created_at')
    .eq('conversacion_id', convId).order('created_at', { ascending: false }).limit(VENTANA_RECIENTE)
  const recientesAsc = ((recientesDesc ?? []) as MensajeRow[]).slice().reverse()
  const fronteraAt = recientesAsc[0]?.created_at ?? null

  const { data: conv } = await supabase
    .from('conversaciones').select('resumen_ia, resumen_hasta_at').eq('id', convId).maybeSingle()
  let resumenFinal = (conv?.resumen_ia as string | null) ?? null
  const resumenHastaAt = (conv?.resumen_hasta_at as string | null) ?? null

  // Mensajes "viejos" (fuera de la ventana reciente) que aún no están
  // incorporados al resumen cacheado.
  let query = supabase.from('mensajes').select('direccion, contenido, created_at')
    .eq('conversacion_id', convId).order('created_at', { ascending: true })
  if (fronteraAt) query = query.lt('created_at', fronteraAt)
  if (resumenHastaAt) query = query.gt('created_at', resumenHastaAt)
  const { data: pendientes } = await query

  if (pendientes?.length) {
    const { data: integ } = await supabase
      .from('integraciones_ia').select('proveedor').eq('tenant_id', tenantId).eq('activo', true)
      .contains('uso_asignado', ['resumenes_conversacion']).limit(1).maybeSingle()
    const proveedor = ((integ?.proveedor as string | undefined) ?? 'OPENAI').toUpperCase()
    const modeloEconomico = MODELO_ECONOMICO_RESUMEN[proveedor] ?? 'gpt-4o-mini'

    const prompt = [
      'Actualiza el resumen de esta conversación de ventas entre un cliente y el negocio.',
      'Sé breve pero conserva datos concretos: nombre, celular/email si se mencionaron, qué producto le interesa, forma de pago (contado/financiado), acuerdos o compromisos, y pendientes.',
      resumenFinal ? `\nResumen hasta ahora:\n${resumenFinal}` : '\nAún no hay resumen previo — es el inicio de la conversación.',
      `\nMensajes nuevos a incorporar:\n${formatearMensajes(pendientes as MensajeRow[])}`,
      '\nEscribe el resumen actualizado completo (no solo lo nuevo):',
    ].join('\n')

    const resultado = await llamarIA(tenantId, 'resumenes_conversacion', prompt, {
      proveedor: proveedor as 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'GROK', modelo: modeloEconomico,
      maxTokens: 400, temperatura: 0.3,
    })
    if (resultado.ok && resultado.texto) {
      resumenFinal = resultado.texto.trim()
      const ultimoPendiente = (pendientes as MensajeRow[])[pendientes.length - 1]
      await supabase.from('conversaciones').update({
        resumen_ia: resumenFinal, resumen_hasta_at: ultimoPendiente.created_at,
      }).eq('id', convId)
    }
  }

  const bloques: string[] = []
  if (resumenFinal) bloques.push(`Resumen de la conversación hasta el momento:\n${resumenFinal}`)
  bloques.push(`Mensajes más recientes:\n${formatearMensajes(recientesAsc)}`)
  return bloques.join('\n\n')
}

// ─── Resumen manual, a pedido de gerencia (pestaña Bandeja) ───────────────────
// A diferencia de obtenerContextoConversacion (que solo llama a la IA cuando
// la conversación supera el umbral automático), esta función SIEMPRE hace una
// llamada a IA — es la acción explícita "Generar resumen" del botón, no el
// funcionamiento normal del agente. Reutiliza el mismo resumen cacheado
// (resumen_ia/resumen_hasta_at) como punto de partida para no re-resumir lo
// que ya estaba cubierto.
export async function generarResumenManual(supabase: Supa, tenantId: string, convId: string): Promise<{ ok: boolean; resumen?: string; error?: string }> {
  const { data: conv } = await supabase
    .from('conversaciones').select('resumen_ia, resumen_hasta_at').eq('id', convId).maybeSingle()
  const resumenPrevio = (conv?.resumen_ia as string | null) ?? null
  const resumenHastaAt = (conv?.resumen_hasta_at as string | null) ?? null

  let query = supabase.from('mensajes').select('direccion, contenido, created_at')
    .eq('conversacion_id', convId).order('created_at', { ascending: true })
  if (resumenHastaAt) query = query.gt('created_at', resumenHastaAt)
  const { data: pendientes } = await query

  if (!pendientes?.length) {
    if (resumenPrevio) return { ok: true, resumen: resumenPrevio }
    return { ok: false, error: 'Todavía no hay mensajes en esta conversación para resumir.' }
  }

  const { data: integ } = await supabase
    .from('integraciones_ia').select('proveedor').eq('tenant_id', tenantId).eq('activo', true)
    .contains('uso_asignado', ['resumenes_conversacion']).limit(1).maybeSingle()
  const proveedor = ((integ?.proveedor as string | undefined) ?? 'OPENAI').toUpperCase()
  const modeloEconomico = MODELO_ECONOMICO_RESUMEN[proveedor] ?? 'gpt-4o-mini'

  const prompt = [
    'Actualiza el resumen de esta conversación de ventas entre un cliente y el negocio.',
    'Sé breve pero conserva datos concretos: nombre, celular/email si se mencionaron, qué producto le interesa, forma de pago (contado/financiado), acuerdos o compromisos, y pendientes.',
    resumenPrevio ? `\nResumen hasta ahora:\n${resumenPrevio}` : '\nAún no hay resumen previo — es el inicio de la conversación.',
    `\nMensajes nuevos a incorporar:\n${formatearMensajes(pendientes as MensajeRow[])}`,
    '\nEscribe el resumen actualizado completo (no solo lo nuevo):',
  ].join('\n')

  const resultado = await llamarIA(tenantId, 'resumenes_conversacion', prompt, {
    proveedor: proveedor as 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'GROK', modelo: modeloEconomico,
    maxTokens: 400, temperatura: 0.3,
  })
  if (!resultado.ok || !resultado.texto) return { ok: false, error: resultado.error ?? 'La IA no devolvió un resumen' }

  const resumenFinal = resultado.texto.trim()
  const ultimoPendiente = (pendientes as MensajeRow[])[pendientes.length - 1]
  await supabase.from('conversaciones').update({
    resumen_ia: resumenFinal, resumen_hasta_at: ultimoPendiente.created_at,
  }).eq('id', convId)
  return { ok: true, resumen: resumenFinal }
}
