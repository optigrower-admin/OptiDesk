import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET /api/cotizaciones-servtec  → lista del tenant
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cotizaciones_servtec')
    .select('id, numero, fecha_generacion, cliente_nombre, cliente_celular, estado, created_at')
    .eq('tenant_id', perfil.tenant_id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/cotizaciones-servtec  → crear cotización con items
export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const body = await req.json()
  const { cliente_id, cliente_nombre, cliente_celular, cliente_email, notas, vigencia_dias, items } = body

  if (!items?.length) return NextResponse.json({ error: 'Sin items' }, { status: 400 })

  const admin = createAdminClient()
  const tid = perfil.tenant_id

  // Siguiente número secuencial
  const { count } = await admin.from('cotizaciones_servtec').select('*', { count: 'exact', head: true }).eq('tenant_id', tid)
  const numero = (count ?? 0) + 1

  const { data: cot, error: errCot } = await admin.from('cotizaciones_servtec').insert({
    tenant_id: tid, numero,
    cliente_id: cliente_id || null,
    cliente_nombre: cliente_nombre || null,
    cliente_celular: cliente_celular || null,
    cliente_email: cliente_email || null,
    notas: notas || null,
    vigencia_dias: vigencia_dias ?? 30,
    created_by: user.id,
  }).select().single()

  if (errCot) return NextResponse.json({ error: errCot.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemsInsert = (items as any[]).map((item: any, i: number) => ({
    cotizacion_id:    cot.id,
    tipo:             item.tipo,
    uma_id:           item.uma_id ?? null,
    referencia:       item.referencia ?? null,
    descripcion:      item.descripcion,
    cantidad:         item.cantidad ?? 1,
    precio_proveedor: item.precio_proveedor ?? null,
    precio_venta:     item.precio_venta,
    orden:            i,
  }))

  const { error: errItems } = await admin.from('cotizaciones_servtec_items').insert(itemsInsert)
  if (errItems) return NextResponse.json({ error: errItems.message }, { status: 500 })

  return NextResponse.json({ id: cot.id, numero: cot.numero })
}
