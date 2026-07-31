import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { conApiKey } from '@/lib/apiPublica/middleware'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  return conApiKey(req, 'conversaciones', 'lectura', async (ctx) => {
    const admin = createAdminClient()
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))
    const canal = searchParams.get('canal')
    const estado = searchParams.get('estado')
    const from = (page - 1) * limit
    const to = from + limit - 1

    let q = admin
      .from('conversaciones')
      .select('id, cliente_id, canal, canal_contact_id, estado, etapa_venta, prioridad, ultimo_mensaje_at, ultimo_mensaje_texto, ultimo_mensaje_direccion, no_leidos_count', { count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
      .range(from, to)
    if (canal) q = q.eq('canal', canal)
    if (estado) q = q.eq('estado', estado)

    const { data, count, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, page, limit, total: count ?? 0 })
  })
}
