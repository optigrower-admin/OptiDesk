import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { conApiKey } from '@/lib/apiPublica/middleware'
import { dispararWebhook } from '@/lib/webhooks/disparar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  return conApiKey(req, 'clientes', 'lectura', async (ctx) => {
    const admin = createAdminClient()
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))
    const search = searchParams.get('search')
    const from = (page - 1) * limit
    const to = from + limit - 1

    let q = admin
      .from('clientes')
      .select('id, nombre, celular, email, etapa_venta, lead_source, forma_pago, created_at', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (search) q = q.or(`nombre.ilike.%${search}%,celular.ilike.%${search}%`)

    const { data, count, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, page, limit, total: count ?? 0 })
  })
}

export async function POST(req: NextRequest) {
  return conApiKey(req, 'clientes', 'escritura', async (ctx) => {
    const admin = createAdminClient()
    const body = await req.json().catch(() => null)
    if (!body?.nombre) return NextResponse.json({ error: 'Falta "nombre"' }, { status: 400 })

    const { data, error } = await admin
      .from('clientes')
      .insert({
        tenant_id: ctx.tenantId,
        nombre: body.nombre,
        celular: body.celular ?? null,
        email: body.email ?? null,
        lead_source: body.lead_source ?? null,
      })
      .select('id, nombre, celular, email, lead_source, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    dispararWebhook(ctx.tenantId, 'lead.creado', { id: data.id, nombre: data.nombre, celular: data.celular }).catch(() => {})
    return NextResponse.json({ data }, { status: 201 })
  })
}
