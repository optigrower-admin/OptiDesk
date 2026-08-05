import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { generarYEnviarReporte, type ReporteProgramadoRow } from '@/lib/reportes/enviarReporte'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = ['gerencia', 'dueno', 'control_total', 'admin'].includes(rolNorm)

  const body = await req.json().catch(() => null) as { id?: string } | null
  if (!body?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: fila } = await admin.from('reportes_programados').select('*')
    .eq('id', body.id).eq('tenant_id', perfil.tenant_id).maybeSingle()
  if (!fila) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (fila.usuario_id !== user.id && !esGerencia) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const resultado = await generarYEnviarReporte(admin, fila as ReporteProgramadoRow)
  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: 400 })
  return NextResponse.json({ ok: true, aviso: resultado.error })
}
