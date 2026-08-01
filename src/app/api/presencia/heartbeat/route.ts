import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Intervalo esperado entre heartbeats del navegador — usado para acumular
// segundos activos y para que el dashboard sepa cuándo considerar "cerrado".
export const INTERVALO_HEARTBEAT_SEGUNDOS = 20

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as { activo?: boolean; pagina?: string } | null
  const activo = !!body?.activo
  const pagina = (body?.pagina ?? '').slice(0, 200) || null

  const admin = createAdminClient()
  const tenantId = perfil.tenant_id as string
  const ahora = new Date()

  const { data: presenciaPrevia } = await admin
    .from('usuarios_presencia')
    .select('pagina_actual')
    .eq('usuario_id', user.id)
    .maybeSingle()

  await admin.from('usuarios_presencia').upsert({
    usuario_id: user.id,
    tenant_id: tenantId,
    activo,
    pagina_actual: pagina,
    ultimo_heartbeat_at: ahora.toISOString(),
  }, { onConflict: 'usuario_id' })

  if (activo) {
    const fecha = ahora.toISOString().slice(0, 10)
    const { data: filaHoy } = await admin
      .from('uso_tiempo_diario')
      .select('segundos_activo')
      .eq('usuario_id', user.id)
      .eq('fecha', fecha)
      .maybeSingle()

    await admin.from('uso_tiempo_diario').upsert({
      usuario_id: user.id,
      tenant_id: tenantId,
      fecha,
      segundos_activo: (filaHoy?.segundos_activo ?? 0) + INTERVALO_HEARTBEAT_SEGUNDOS,
    }, { onConflict: 'usuario_id,fecha' })
  }

  // Solo registrar navegación cuando cambia de página, para no llenar la
  // tabla con una fila por cada heartbeat mientras el usuario se queda quieto.
  if (pagina && pagina !== presenciaPrevia?.pagina_actual) {
    await admin.from('uso_navegacion').insert({ usuario_id: user.id, tenant_id: tenantId, seccion: pagina })
  }

  return NextResponse.json({ ok: true })
}
