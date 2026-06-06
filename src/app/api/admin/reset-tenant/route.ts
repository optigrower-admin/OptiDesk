import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
  if (perfil?.rol !== 'control_total') {
    return NextResponse.json({ error: 'Solo control_total puede ejecutar esta acción' }, { status: 403 })
  }

  const { tenant_id, confirmar_nombre, modo } = await req.json()
  if (!tenant_id || !confirmar_nombre || !modo) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }
  if (modo !== 'completo' && modo !== 'operativo') {
    return NextResponse.json({ error: 'Modo inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: tenant } = await supabase.from('tenants').select('id, nombre').eq('id', tenant_id).single()
  if (!tenant) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  if (tenant.nombre.trim().toLowerCase() !== confirmar_nombre.trim().toLowerCase()) {
    return NextResponse.json({ error: 'El nombre de confirmación no coincide' }, { status: 400 })
  }

  // Helper: lanza si el delete falla (Supabase devuelve { error } en vez de lanzar)
  const del = async (tabla: string) => {
    const { error } = await admin.from(tabla).delete().eq('tenant_id', tenant_id)
    if (error) throw new Error(`Error eliminando ${tabla}: ${error.message}`)
  }

  try {
    await del('auditoria')
    await del('medios')
    await del('movimientos_inventario')

    // items_orden no tiene tenant_id — hay que borrar por orden_id
    const { data: ordenIds, error: ordenErr } = await admin
      .from('ordenes')
      .select('id')
      .eq('tenant_id', tenant_id)
    if (ordenErr) throw new Error(`Error obteniendo órdenes: ${ordenErr.message}`)

    if (ordenIds && ordenIds.length > 0) {
      const ids = ordenIds.map((o: { id: string }) => o.id)
      const { error: itemsErr } = await admin.from('items_orden').delete().in('orden_id', ids)
      if (itemsErr) throw new Error(`Error eliminando items_orden: ${itemsErr.message}`)
    }

    await del('ordenes')
    await del('repuestos_externos')

    if (modo === 'completo') {
      await del('motos')
      await del('clientes')
    }

    const { error: updErr } = await admin
      .from('tenants')
      .update({ storage_usado_bytes: 0 })
      .eq('id', tenant_id)
    if (updErr) throw new Error(`Error actualizando storage: ${updErr.message}`)

    // Auditoría en el tenant afectado (control_total no tiene tenant_id propio)
    await admin.from('auditoria').insert({
      tenant_id,
      usuario_id: user.id,
      accion: `reset_tenant_${modo}`,
      tabla: 'tenants',
      registro_id: tenant_id,
      detalle: { tenant_nombre: tenant.nombre, ejecutado_por: user.email, modo },
    })

    const msg = modo === 'completo'
      ? `Empresa "${tenant.nombre}" reiniciada completamente`
      : `Órdenes e historial de "${tenant.nombre}" eliminados — clientes y motos conservados`

    return NextResponse.json({ ok: true, mensaje: msg })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
