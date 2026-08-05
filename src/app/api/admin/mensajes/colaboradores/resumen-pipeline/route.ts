import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { enviarResumenPipeline, ejecutarResumenPipelineTodos } from '@/lib/ventas/resumenPipelineEmail'

async function getPerfilGerencia(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return null
  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'
  if (!esGerencia) return null
  return { tenantId: perfil.tenant_id as string }
}

// Disparo manual del resumen de pipeline por correo — para probar cómo le
// llega a un colaborador puntual, o enviárselo ya mismo a todos los que
// tengan la opción activada.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const perfil = await getPerfilGerencia(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { usuarioId?: string }
  const admin = createAdminClient()

  if (body.usuarioId) {
    const resultado = await enviarResumenPipeline(admin, perfil.tenantId, body.usuarioId)
    if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  const resultado = await ejecutarResumenPipelineTodos(admin, perfil.tenantId)
  return NextResponse.json(resultado)
}
