import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET /api/cotizaciones-servtec/[id]
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const admin = createAdminClient()
  const { data: cot } = await admin.from('cotizaciones_servtec').select('*').eq('id', params.id).single()
  if (!cot || cot.tenant_id !== perfil.tenant_id) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const { data: items } = await admin.from('cotizaciones_servtec_items')
    .select('*').eq('cotizacion_id', params.id).order('orden')

  return NextResponse.json({ ...cot, items: items ?? [] })
}

// PUT /api/cotizaciones-servtec/[id] — actualizar cotización
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const admin = createAdminClient()
  const { data: cot } = await admin.from('cotizaciones_servtec').select('tenant_id').eq('id', params.id).single()
  if (!cot || cot.tenant_id !== perfil.tenant_id) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const body = await req.json()
  const { cliente_id, cliente_nombre, cliente_celular, cliente_email, notas, vigencia_dias, items } = body

  const { error: errUpd } = await admin.from('cotizaciones_servtec').update({
    cliente_id: cliente_id || null,
    cliente_nombre: cliente_nombre || null,
    cliente_celular: cliente_celular || null,
    cliente_email: cliente_email || null,
    notas: notas || null,
    vigencia_dias: vigencia_dias ?? 30,
  }).eq('id', params.id)
  if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 })

  // Reemplazar items: borrar los viejos e insertar los nuevos
  await admin.from('cotizaciones_servtec_items').delete().eq('cotizacion_id', params.id)
  if (items?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsInsert = (items as any[]).map((item: any, i: number) => ({
      cotizacion_id: params.id,
      tipo: item.tipo, uma_id: item.uma_id ?? null,
      referencia: item.referencia ?? null, descripcion: item.descripcion,
      cantidad: item.cantidad ?? 1, precio_proveedor: item.precio_proveedor ?? null,
      precio_venta: item.precio_venta, orden: i,
    }))
    await admin.from('cotizaciones_servtec_items').insert(itemsInsert)
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/cotizaciones-servtec/[id]
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const admin = createAdminClient()
  const { data: cot } = await admin.from('cotizaciones_servtec').select('tenant_id').eq('id', params.id).single()
  if (!cot || cot.tenant_id !== perfil.tenant_id) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  await admin.from('cotizaciones_servtec').delete().eq('id', params.id)
  return NextResponse.json({ ok: true })
}
