import { createAdminClient } from '@/lib/supabase/admin'

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
