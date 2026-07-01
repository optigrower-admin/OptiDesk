import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const body = await req.json()
  const { cliente_id, cliente_nombre, cliente_celular, cliente_email, opciones, notas, vigencia_dias } = body

  const admin = createAdminClient()

  // Número correlativo: COUNT de cotizaciones existentes del tenant (no depende de columnas nuevas)
  const { count } = await admin.from('cotizaciones')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', perfil.tenant_id)
  const nuevoNumero = (count ?? 0) + 1

  const { data: cotizacion, error } = await admin.from('cotizaciones').insert({
    tenant_id: perfil.tenant_id,
    cliente_id: cliente_id || null,
    numero: nuevoNumero,
    cliente_nombre,
    cliente_celular,
    cliente_email,
    opciones,
    notas: notas || null,
    vigencia_dias: vigencia_dias ?? 30,
    estado: 'generada',
    created_by: user.id,
  }).select('id').single()

  if (error) {
    console.error('[POST /api/cotizaciones] insert error:', JSON.stringify(error))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id: cotizacion.id, numero: nuevoNumero })
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const clienteId = req.nextUrl.searchParams.get('cliente_id')
  let q = supabase.from('cotizaciones').select('id, numero, fecha_generacion, vigencia_dias, estado, notas, created_at')

  if (clienteId) q = q.eq('cliente_id', clienteId)
  const { data } = await q.order('created_at', { ascending: false }).limit(20)
  return NextResponse.json(data ?? [])
}
