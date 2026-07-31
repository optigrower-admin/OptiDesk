import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { conApiKey } from '@/lib/apiPublica/middleware'
import { dispararWebhook } from '@/lib/webhooks/disparar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  return conApiKey(req, 'pagos', 'lectura', async (ctx) => {
    const admin = createAdminClient()
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))
    const clienteId = searchParams.get('cliente_id')
    const from = (page - 1) * limit
    const to = from + limit - 1

    let q = admin
      .from('clientes_pagos')
      .select('id, cliente_id, codigo_factura, monto, metodo_pago, created_at', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (clienteId) q = q.eq('cliente_id', clienteId)

    const { data, count, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, page, limit, total: count ?? 0 })
  })
}

export async function POST(req: NextRequest) {
  return conApiKey(req, 'pagos', 'escritura', async (ctx) => {
    const admin = createAdminClient()
    const body = await req.json().catch(() => null)
    if (!body?.cliente_id || !body?.monto) {
      return NextResponse.json({ error: 'Faltan "cliente_id" y/o "monto"' }, { status: 400 })
    }

    const { data: cliente } = await admin.from('clientes').select('id').eq('id', body.cliente_id).eq('tenant_id', ctx.tenantId).maybeSingle()
    if (!cliente) return NextResponse.json({ error: 'cliente_id no encontrado en este tenant' }, { status: 404 })

    const { data, error } = await admin
      .from('clientes_pagos')
      .insert({
        tenant_id: ctx.tenantId,
        cliente_id: body.cliente_id,
        monto: body.monto,
        codigo_factura: body.codigo_factura ?? null,
        metodo_pago: body.metodo_pago ?? null,
      })
      .select('id, cliente_id, codigo_factura, monto, metodo_pago, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    dispararWebhook(ctx.tenantId, 'pago.recibido', { id: data.id, cliente_id: data.cliente_id, monto: data.monto }).catch(() => {})
    return NextResponse.json({ data }, { status: 201 })
  })
}
