import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: agente } = await admin.from('agentes_ia').select('id').eq('id', params.id).eq('tenant_id', perfil.tenant_id).maybeSingle()
  if (!agente) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })

  const { data, error } = await admin
    .from('agente_ejecuciones')
    .select('id, conversacion_id, mensaje_entrada, herramienta_invocada, parametros_herramienta, respuesta_texto, exitoso, error_mensaje, duracion_ms, created_at')
    .eq('agente_id', params.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ejecuciones: data ?? [] })
}
