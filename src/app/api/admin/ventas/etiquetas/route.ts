import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// POST — crear etiqueta y/o aplicarla a un cliente
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { accion, nombre, color, etiqueta_id, cliente_id } =
    await req.json() as {
      accion: 'crear_y_aplicar' | 'aplicar' | 'quitar'
      nombre?: string
      color?: string
      etiqueta_id?: string
      cliente_id?: string
    }

  const admin = createAdminClient()

  if (accion === 'crear_y_aplicar') {
    if (!nombre || !color || !cliente_id)
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

    // Crear la etiqueta (o recuperar si ya existe con ese nombre)
    const { data: existente } = await admin
      .from('etiquetas_venta')
      .select('id, nombre, color')
      .eq('tenant_id', perfil.tenant_id)
      .eq('nombre', nombre)
      .maybeSingle()

    let etiqueta = existente
    if (!etiqueta) {
      const { data: nueva, error } = await admin
        .from('etiquetas_venta')
        .insert({ tenant_id: perfil.tenant_id, nombre, color })
        .select('id, nombre, color')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      etiqueta = nueva
    }

    // Aplicar al cliente
    await admin.from('clientes_etiquetas').upsert(
      { cliente_id, etiqueta_id: etiqueta!.id, tenant_id: perfil.tenant_id },
      { onConflict: 'cliente_id,etiqueta_id' }
    )

    return NextResponse.json({ ok: true, etiqueta })
  }

  if (accion === 'aplicar') {
    if (!etiqueta_id || !cliente_id)
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    await admin.from('clientes_etiquetas').upsert(
      { cliente_id, etiqueta_id, tenant_id: perfil.tenant_id },
      { onConflict: 'cliente_id,etiqueta_id' }
    )
    return NextResponse.json({ ok: true })
  }

  if (accion === 'quitar') {
    if (!etiqueta_id || !cliente_id)
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    await admin.from('clientes_etiquetas')
      .delete()
      .eq('cliente_id', cliente_id)
      .eq('etiqueta_id', etiqueta_id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}

// GET — listar etiquetas del tenant
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('etiquetas_venta')
    .select('id, nombre, color')
    .eq('tenant_id', perfil.tenant_id)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ etiquetas: data ?? [] })
}
