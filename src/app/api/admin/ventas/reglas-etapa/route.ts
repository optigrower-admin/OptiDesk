import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CAMPOS_VALIDOS = [
  'celular', 'placa', 'alistamiento', 'numero_factura',
  'numero_carta_negociacion', 'fecha_entrega', 'aprobacion_gerencia',
] as const

async function getTenantId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  return perfil?.tenant_id as string | undefined
}

async function mover<T extends { id: string; orden: number }>(
  admin: ReturnType<typeof createAdminClient>,
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
  await admin.from('reglas_etapa').update({ orden: vecino.orden }).eq('id', actual.id)
  await admin.from('reglas_etapa').update({ orden: actual.orden }).eq('id', vecino.id)
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const tenantId = await getTenantId(supabase)
  if (!tenantId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const etapaId = req.nextUrl.searchParams.get('etapa_id')
  const admin = createAdminClient()
  let query = admin.from('reglas_etapa').select('*').eq('tenant_id', tenantId).order('orden')
  if (etapaId) query = query.eq('etapa_id', etapaId)
  const { data, error } = await query
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
    etapa_id?: string
    campo?: string
    etiqueta?: string
    mensaje_ayuda?: string | null
    color?: string
    bloquea_cambio_etapa?: boolean
    activa?: boolean
    direccion?: 'arriba' | 'abajo'
  }

  const { accion } = body

  if (accion === 'crear_regla') {
    if (!body.etapa_id || !body.campo || !body.etiqueta?.trim())
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    if (!CAMPOS_VALIDOS.includes(body.campo as typeof CAMPOS_VALIDOS[number]))
      return NextResponse.json({ error: 'Campo inválido' }, { status: 400 })
    const { data: existentes } = await admin.from('reglas_etapa').select('orden').eq('etapa_id', body.etapa_id)
    const orden = Math.max(-1, ...(existentes ?? []).map(r => r.orden)) + 1
    const { data, error } = await admin
      .from('reglas_etapa')
      .insert({
        tenant_id: tenantId, etapa_id: body.etapa_id, campo: body.campo,
        etiqueta: body.etiqueta.trim(), mensaje_ayuda: body.mensaje_ayuda?.trim() || null,
        color: body.color ?? '#f97316', bloquea_cambio_etapa: body.bloquea_cambio_etapa ?? false,
        orden,
      })
      .select('*').single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Esta etapa ya tiene una regla para ese campo' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ regla: data })
  }

  if (accion === 'editar_regla') {
    if (!body.regla_id) return NextResponse.json({ error: 'Falta regla_id' }, { status: 400 })
    const updates: Record<string, string | boolean | null> = {}
    if (body.etiqueta?.trim()) updates.etiqueta = body.etiqueta.trim()
    if (body.mensaje_ayuda !== undefined) updates.mensaje_ayuda = body.mensaje_ayuda?.trim() || null
    if (body.color) updates.color = body.color
    if (body.bloquea_cambio_etapa !== undefined) updates.bloquea_cambio_etapa = body.bloquea_cambio_etapa
    if (body.activa !== undefined) updates.activa = body.activa
    const { error } = await admin.from('reglas_etapa').update(updates).eq('id', body.regla_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'eliminar_regla') {
    if (!body.regla_id) return NextResponse.json({ error: 'Falta regla_id' }, { status: 400 })
    const { error } = await admin.from('reglas_etapa').delete().eq('id', body.regla_id).eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'mover_regla') {
    if (!body.regla_id || !body.direccion) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    const { data: regla } = await admin.from('reglas_etapa').select('etapa_id').eq('id', body.regla_id).single()
    if (!regla) return NextResponse.json({ error: 'Regla no encontrada' }, { status: 404 })
    const { data: hermanos } = await admin.from('reglas_etapa').select('id, orden').eq('etapa_id', regla.etapa_id)
    await mover(admin, hermanos ?? [], body.regla_id, body.direccion)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
