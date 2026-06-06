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

  const { tenant_id, confirmar_nombre } = await req.json()
  if (!tenant_id || !confirmar_nombre) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: tenant } = await admin.from('tenants').select('id, nombre').eq('id', tenant_id).single()
  if (!tenant) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  if (tenant.nombre.trim().toLowerCase() !== confirmar_nombre.trim().toLowerCase()) {
    return NextResponse.json({ error: 'El nombre de confirmación no coincide' }, { status: 400 })
  }

  try {
    // Borrar en orden respetando foreign keys
    await admin.from('auditoria').delete().eq('tenant_id', tenant_id)
    await admin.from('medios').delete().eq('tenant_id', tenant_id)
    await admin.from('movimientos_inventario').delete().eq('tenant_id', tenant_id)

    // items_orden depende de ordenes → borrar primero los items
    const { data: ordenIds } = await admin
      .from('ordenes').select('id').eq('tenant_id', tenant_id)
    if (ordenIds && ordenIds.length > 0) {
      const ids = ordenIds.map((o: { id: string }) => o.id)
      await admin.from('items_orden').delete().in('orden_id', ids)
    }

    await admin.from('ordenes').delete().eq('tenant_id', tenant_id)
    await admin.from('repuestos_externos').delete().eq('tenant_id', tenant_id)
    await admin.from('motos').delete().eq('tenant_id', tenant_id)
    await admin.from('clientes').delete().eq('tenant_id', tenant_id)

    // Resetear contador de storage
    await admin.from('tenants').update({ storage_usado_bytes: 0 }).eq('id', tenant_id)

    // Log de auditoría en el tenant del admin que ejecutó
    const { data: adminPerfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
    if (adminPerfil) {
      await admin.from('auditoria').insert({
        tenant_id: adminPerfil.tenant_id,
        usuario_id: user.id,
        accion: 'reset_tenant',
        tabla: 'tenants',
        registro_id: tenant_id,
        detalle: { tenant_nombre: tenant.nombre, ejecutado_por: user.email },
      })
    }

    return NextResponse.json({ ok: true, mensaje: `Datos de "${tenant.nombre}" eliminados correctamente` })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al reiniciar: ${msg}` }, { status: 500 })
  }
}
