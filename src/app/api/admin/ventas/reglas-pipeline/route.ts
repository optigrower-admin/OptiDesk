import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getTenantId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  return perfil?.tenant_id as string | undefined
}

export async function GET() {
  const supabase = createClient()
  const tenantId = await getTenantId(supabase)
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('reglas_transicion_pipeline')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reglas: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const tenantId = await getTenantId(supabase)
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const body = await req.json() as {
    accion: string
    regla_id?: string
    nombre?: string
    etapa_origen_id?: string
    etapa_destino_id?: string
    dias_en_etapa?: number
    activa?: boolean
  }

  if (body.accion === 'crear') {
    if (!body.nombre?.trim() || !body.etapa_origen_id || !body.etapa_destino_id)
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    if (body.etapa_origen_id === body.etapa_destino_id)
      return NextResponse.json({ error: 'La etapa de origen y destino no pueden ser la misma' }, { status: 400 })
    const { data, error } = await admin
      .from('reglas_transicion_pipeline')
      .insert({
        tenant_id: tenantId, nombre: body.nombre.trim(),
        etapa_origen_id: body.etapa_origen_id, etapa_destino_id: body.etapa_destino_id,
        dias_en_etapa: body.dias_en_etapa ?? 1,
      })
      .select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ regla: data })
  }

  if (body.accion === 'editar') {
    if (!body.regla_id) return NextResponse.json({ error: 'Falta regla_id' }, { status: 400 })
    const updates: Record<string, string | number | boolean> = {}
    if (body.nombre?.trim()) updates.nombre = body.nombre.trim()
    if (body.etapa_origen_id) updates.etapa_origen_id = body.etapa_origen_id
    if (body.etapa_destino_id) updates.etapa_destino_id = body.etapa_destino_id
    if (body.dias_en_etapa !== undefined) updates.dias_en_etapa = body.dias_en_etapa
    if (body.activa !== undefined) updates.activa = body.activa
    const { error } = await admin.from('reglas_transicion_pipeline').update(updates).eq('id', body.regla_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.accion === 'eliminar') {
    if (!body.regla_id) return NextResponse.json({ error: 'Falta regla_id' }, { status: 400 })
    const { error } = await admin.from('reglas_transicion_pipeline').delete().eq('id', body.regla_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
