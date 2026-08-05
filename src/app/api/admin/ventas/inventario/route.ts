import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { calcularInventarioMotos } from '@/lib/ventas/inventario'
import { registrarAuditoria } from '@/lib/audit'

async function getPerfil(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return null
  const rolNorm = (perfil.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = rolNorm === 'gerencia' || rolNorm === 'control_total' || rolNorm === 'dueno'
  return { userId: user.id, tenantId: perfil.tenant_id as string, esGerencia }
}

export async function GET() {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [inventario, { data: motos }, { data: colores }] = await Promise.all([
    calcularInventarioMotos(admin, perfil.tenantId),
    admin.from('motos_catalogo').select('id, referencia').eq('tenant_id', perfil.tenantId).eq('activa', true).order('orden'),
    admin.from('motos_catalogo_colores').select('id, moto_catalogo_id, nombre').eq('tenant_id', perfil.tenantId).order('orden'),
  ])
  return NextResponse.json({ inventario, motosDisponibles: motos ?? [], coloresPorMoto: colores ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const perfil = await getPerfil(supabase)
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const body = await req.json().catch(() => null) as {
    accion?: string; id?: string; moto_catalogo_id?: string; color_id?: string | null
    cantidad_total?: number; cantidad_entrada?: number
  } | null
  const { accion } = body ?? {}

  // Registrar entrada de unidades (ej. "hoy llegaron 3 motos") — abierto a
  // cualquier rol: solo SUMA a lo que ya había (o crea el renglón si es la
  // primera vez), nunca sobreescribe ni borra. Ajustar/corregir el total
  // exacto o eliminar sigue siendo solo de gerencia (acciones de abajo).
  if (accion === 'entrada') {
    if (!body?.moto_catalogo_id) return NextResponse.json({ error: 'Falta la moto' }, { status: 400 })
    const cantidadEntrada = Math.floor(Number(body.cantidad_entrada ?? 0))
    if (!cantidadEntrada || cantidadEntrada <= 0) return NextResponse.json({ error: 'Ingresa una cantidad válida' }, { status: 400 })
    const colorId = body.color_id || null

    let q = admin.from('inventario_motos').select('id, cantidad_total')
      .eq('tenant_id', perfil.tenantId).eq('moto_catalogo_id', body.moto_catalogo_id)
    q = colorId ? q.eq('color_id', colorId) : q.is('color_id', null)
    const { data: existente } = await q.maybeSingle()

    let registroId: string
    if (existente) {
      const nuevaCantidad = (existente.cantidad_total ?? 0) + cantidadEntrada
      const { error } = await admin.from('inventario_motos')
        .update({ cantidad_total: nuevaCantidad, updated_at: new Date().toISOString() }).eq('id', existente.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      registroId = existente.id
    } else {
      const { data: creado, error } = await admin.from('inventario_motos').insert({
        tenant_id: perfil.tenantId, moto_catalogo_id: body.moto_catalogo_id, color_id: colorId, cantidad_total: cantidadEntrada,
      }).select('id').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      registroId = creado.id
    }

    await registrarAuditoria(admin, {
      tenant_id: perfil.tenantId, tabla: 'inventario_motos', registro_id: registroId, tipo: 'movimiento',
      descripcion: `Registró entrada de ${cantidadEntrada} unidad${cantidadEntrada !== 1 ? 'es' : ''} a inventario de motos`,
      usuario_id: perfil.userId,
    })
    return NextResponse.json({ ok: true })
  }

  // El resto de acciones (crear con cantidad exacta, editar, eliminar) sí
  // requieren gerencia — pueden sobreescribir o borrar lo que ya hay.
  if (!perfil.esGerencia) return NextResponse.json({ error: 'Solo gerencia puede editar o eliminar del inventario' }, { status: 403 })

  if (accion === 'crear') {
    if (!body?.moto_catalogo_id) return NextResponse.json({ error: 'Falta la moto' }, { status: 400 })
    const cantidad = Math.max(0, Number(body.cantidad_total ?? 0))
    const colorId = body.color_id || null

    if (colorId) {
      const { error } = await admin.from('inventario_motos').upsert({
        tenant_id: perfil.tenantId, moto_catalogo_id: body.moto_catalogo_id, color_id: colorId, cantidad_total: cantidad,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,moto_catalogo_id,color_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // Sin color: Postgres no deduplica NULL vía UNIQUE/upsert, así que se
    // busca a mano el renglón "sin color" existente para esa moto.
    const { data: existente } = await admin.from('inventario_motos')
      .select('id').eq('tenant_id', perfil.tenantId).eq('moto_catalogo_id', body.moto_catalogo_id).is('color_id', null).maybeSingle()
    if (existente) {
      const { error } = await admin.from('inventario_motos')
        .update({ cantidad_total: cantidad, updated_at: new Date().toISOString() }).eq('id', existente.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await admin.from('inventario_motos').insert({
        tenant_id: perfil.tenantId, moto_catalogo_id: body.moto_catalogo_id, color_id: null, cantidad_total: cantidad,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (accion === 'editar') {
    if (!body?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const cantidad = Math.max(0, Number(body.cantidad_total ?? 0))
    const { error } = await admin.from('inventario_motos')
      .update({ cantidad_total: cantidad, updated_at: new Date().toISOString() })
      .eq('id', body.id).eq('tenant_id', perfil.tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'eliminar') {
    if (!body?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const { error } = await admin.from('inventario_motos').delete().eq('id', body.id).eq('tenant_id', perfil.tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
