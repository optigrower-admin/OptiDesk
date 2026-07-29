import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type EtapaFlags = {
  es_activa?: boolean
  es_lead?: boolean
  es_etapa_inicial?: boolean
  es_ganado?: boolean
  es_perdido?: boolean
  requiere_celular?: boolean
  requiere_placa?: boolean
  requiere_fecha_entrega?: boolean
  requiere_carta_negociacion?: boolean
  requiere_factura?: boolean
  requiere_aprobacion_gerencia?: boolean
}

async function getTenantId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  return perfil?.tenant_id as string | undefined
}

// Reordena moviendo un registro un puesto arriba/abajo dentro de su grupo de hermanos
async function mover<T extends { id: string; orden: number }>(
  admin: ReturnType<typeof createAdminClient>,
  tabla: string,
  hermanos: T[],
  id: string,
  direccion: 'arriba' | 'abajo',
) {
  const ordenados = [...hermanos].sort((a, b) => a.orden - b.orden)
  const idx = ordenados.findIndex(x => x.id === id)
  const vecinoIdx = direccion === 'arriba' ? idx - 1 : idx + 1
  if (idx === -1 || vecinoIdx < 0 || vecinoIdx >= ordenados.length) return
  const actual = ordenados[idx]
  const vecino = ordenados[vecinoIdx]
  await admin.from(tabla).update({ orden: vecino.orden }).eq('id', actual.id)
  await admin.from(tabla).update({ orden: actual.orden }).eq('id', vecino.id)
}

export async function GET() {
  const supabase = createClient()
  const tenantId = await getTenantId(supabase)
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [{ data: pipelines }, { data: grupos }, { data: etapas }] = await Promise.all([
    admin.from('pipelines_venta').select('*').eq('tenant_id', tenantId).order('orden'),
    admin.from('pipeline_grupos').select('*').eq('tenant_id', tenantId).order('orden'),
    admin.from('etapas_pipeline').select('*').eq('tenant_id', tenantId).order('orden'),
  ])

  const arbol = (pipelines ?? []).map(p => ({
    ...p,
    grupos: (grupos ?? [])
      .filter(g => g.pipeline_id === p.id)
      .map(g => ({
        ...g,
        etapas: (etapas ?? []).filter(e => e.grupo_id === g.id),
      })),
  }))

  return NextResponse.json({ pipelines: arbol })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const tenantId = await getTenantId(supabase)
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const body = await req.json() as {
    accion: string
    pipeline_id?: string
    grupo_id?: string
    etapa_id?: string
    nombre?: string
    color?: string
    label?: string
    bg?: string
    border?: string
    direccion?: 'arriba' | 'abajo'
  } & EtapaFlags

  const { accion } = body

  // ─── Pipelines ──────────────────────────────────────────────────────────
  if (accion === 'crear_pipeline') {
    if (!body.nombre?.trim()) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })
    const { data: existentes } = await admin.from('pipelines_venta').select('orden').eq('tenant_id', tenantId)
    const orden = Math.max(-1, ...(existentes ?? []).map(p => p.orden)) + 1
    const clave = body.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + Date.now().toString(36)
    const { data, error } = await admin
      .from('pipelines_venta')
      .insert({ tenant_id: tenantId, clave, nombre: body.nombre.trim(), orden })
      .select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ pipeline: data })
  }

  if (accion === 'editar_pipeline') {
    if (!body.pipeline_id || !body.nombre?.trim()) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    const { error } = await admin.from('pipelines_venta')
      .update({ nombre: body.nombre.trim() }).eq('id', body.pipeline_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'eliminar_pipeline') {
    if (!body.pipeline_id) return NextResponse.json({ error: 'Falta pipeline_id' }, { status: 400 })
    const { count } = await admin.from('clientes')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('etapa_venta', (await admin.from('etapas_pipeline').select('clave').eq('pipeline_id', body.pipeline_id)).data?.map(e => e.clave) ?? [''])
    if ((count ?? 0) > 0)
      return NextResponse.json({ error: `No se puede eliminar: hay ${count} cliente(s) en etapas de este pipeline` }, { status: 409 })
    const { error } = await admin.from('pipelines_venta').delete().eq('id', body.pipeline_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'mover_pipeline') {
    if (!body.pipeline_id || !body.direccion) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    const { data: hermanos } = await admin.from('pipelines_venta').select('id, orden').eq('tenant_id', tenantId)
    await mover(admin, 'pipelines_venta', hermanos ?? [], body.pipeline_id, body.direccion)
    return NextResponse.json({ ok: true })
  }

  // ─── Grupos ─────────────────────────────────────────────────────────────
  if (accion === 'crear_grupo') {
    if (!body.pipeline_id || !body.nombre?.trim()) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    const { data: existentes } = await admin.from('pipeline_grupos').select('orden').eq('pipeline_id', body.pipeline_id)
    const orden = Math.max(-1, ...(existentes ?? []).map(g => g.orden)) + 1
    const clave = body.nombre.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + Date.now().toString(36)
    const { data, error } = await admin
      .from('pipeline_grupos')
      .insert({ tenant_id: tenantId, pipeline_id: body.pipeline_id, clave, nombre: body.nombre.trim(), color: body.color ?? '#2563EB', orden })
      .select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ grupo: data })
  }

  if (accion === 'editar_grupo') {
    if (!body.grupo_id) return NextResponse.json({ error: 'Falta grupo_id' }, { status: 400 })
    const updates: Record<string, string> = {}
    if (body.nombre?.trim()) updates.nombre = body.nombre.trim()
    if (body.color) updates.color = body.color
    const { error } = await admin.from('pipeline_grupos').update(updates).eq('id', body.grupo_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'eliminar_grupo') {
    if (!body.grupo_id) return NextResponse.json({ error: 'Falta grupo_id' }, { status: 400 })
    const { count } = await admin.from('etapas_pipeline').select('id', { count: 'exact', head: true }).eq('grupo_id', body.grupo_id)
    if ((count ?? 0) > 0)
      return NextResponse.json({ error: `No se puede eliminar: el grupo tiene ${count} etapa(s). Elimínalas o muévelas primero.` }, { status: 409 })
    const { error } = await admin.from('pipeline_grupos').delete().eq('id', body.grupo_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'mover_grupo') {
    if (!body.grupo_id || !body.direccion) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    const { data: grupo } = await admin.from('pipeline_grupos').select('pipeline_id').eq('id', body.grupo_id).single()
    if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })
    const { data: hermanos } = await admin.from('pipeline_grupos').select('id, orden').eq('pipeline_id', grupo.pipeline_id)
    await mover(admin, 'pipeline_grupos', hermanos ?? [], body.grupo_id, body.direccion)
    return NextResponse.json({ ok: true })
  }

  // ─── Etapas ─────────────────────────────────────────────────────────────
  if (accion === 'crear_etapa') {
    if (!body.pipeline_id || !body.grupo_id || !body.label?.trim())
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    const { data: existentes } = await admin.from('etapas_pipeline').select('orden').eq('pipeline_id', body.pipeline_id)
    const orden = Math.max(-1, ...(existentes ?? []).map(e => e.orden)) + 1
    const clave = body.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + Date.now().toString(36)
    const { data, error } = await admin
      .from('etapas_pipeline')
      .insert({
        tenant_id: tenantId, pipeline_id: body.pipeline_id, grupo_id: body.grupo_id,
        clave, label: body.label.trim(),
        color: body.color ?? '#2563EB', bg: body.bg ?? 'bg-blue-50', border: body.border ?? 'border-blue-500',
        orden,
        es_activa: body.es_activa ?? true,
        es_lead: body.es_lead ?? false,
        es_etapa_inicial: body.es_etapa_inicial ?? false,
        es_ganado: body.es_ganado ?? false,
        es_perdido: body.es_perdido ?? false,
        requiere_celular: body.requiere_celular ?? false,
        requiere_placa: body.requiere_placa ?? false,
        requiere_fecha_entrega: body.requiere_fecha_entrega ?? false,
        requiere_carta_negociacion: body.requiere_carta_negociacion ?? false,
        requiere_factura: body.requiere_factura ?? false,
        requiere_aprobacion_gerencia: body.requiere_aprobacion_gerencia ?? false,
      })
      .select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ etapa: data })
  }

  if (accion === 'editar_etapa') {
    if (!body.etapa_id) return NextResponse.json({ error: 'Falta etapa_id' }, { status: 400 })
    const camposTexto = ['label', 'color', 'bg', 'border'] as const
    const camposFlag = [
      'es_activa', 'es_lead', 'es_etapa_inicial', 'es_ganado', 'es_perdido',
      'requiere_celular', 'requiere_placa', 'requiere_fecha_entrega',
      'requiere_carta_negociacion', 'requiere_factura', 'requiere_aprobacion_gerencia',
    ] as const
    const updates: Record<string, string | boolean> = {}
    for (const c of camposTexto) if (body[c] !== undefined) updates[c] = body[c] as string
    for (const c of camposFlag) if (body[c] !== undefined) updates[c] = body[c] as boolean
    const { error } = await admin.from('etapas_pipeline').update(updates).eq('id', body.etapa_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'eliminar_etapa') {
    if (!body.etapa_id) return NextResponse.json({ error: 'Falta etapa_id' }, { status: 400 })
    const { data: etapa } = await admin.from('etapas_pipeline').select('clave').eq('id', body.etapa_id).single()
    if (!etapa) return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 })
    const { count } = await admin.from('clientes')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('etapa_venta', etapa.clave)
    if ((count ?? 0) > 0)
      return NextResponse.json({ error: `No se puede eliminar: hay ${count} cliente(s) en esta etapa` }, { status: 409 })
    const { error } = await admin.from('etapas_pipeline').delete().eq('id', body.etapa_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'mover_etapa') {
    if (!body.etapa_id || !body.direccion) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    const { data: etapa } = await admin.from('etapas_pipeline').select('grupo_id').eq('id', body.etapa_id).single()
    if (!etapa?.grupo_id) return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 })
    const { data: hermanos } = await admin.from('etapas_pipeline').select('id, orden').eq('grupo_id', etapa.grupo_id)
    await mover(admin, 'etapas_pipeline', hermanos ?? [], body.etapa_id, body.direccion)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
