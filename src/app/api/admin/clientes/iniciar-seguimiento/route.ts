import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarOCrearCliente } from '@/lib/clientes/buscarOCrearCliente'
import { NextRequest, NextResponse } from 'next/server'

interface Body {
  primer_nombre: string
  segundo_nombre?: string | null
  primer_apellido?: string | null
  segundo_apellido?: string | null
  tipo_documento?: string | null
  numero_documento?: string | null
  celular: string
  email?: string | null
}

/**
 * POST /api/admin/clientes/iniciar-seguimiento
 * Body: Body (ver arriba)
 *
 * Busca un cliente existente por número de documento/celular (mismo criterio
 * que buscarOCrearCliente) o crea uno nuevo, y lo marca para Seguimiento
 * Ventas. Para clientes gestionados en persona, sin chat previo.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const {
    primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
    tipo_documento, numero_documento, celular, email,
  } = await req.json() as Body

  if (!primer_nombre?.trim()) {
    return NextResponse.json({ error: 'Falta el primer nombre' }, { status: 400 })
  }
  if (!celular?.trim()) {
    return NextResponse.json({ error: 'Falta el número de celular' }, { status: 400 })
  }

  const nombreCompleto = [primer_nombre, segundo_nombre, primer_apellido, segundo_apellido]
    .filter(Boolean).map(s => s!.trim()).filter(Boolean).join(' ')

  try {
    const { cliente } = await buscarOCrearCliente({
      tenantId: perfil.tenant_id,
      nombre: nombreCompleto,
      primerNombre: primer_nombre.trim(),
      segundoNombre: segundo_nombre?.trim() || undefined,
      primerApellido: primer_apellido?.trim() || undefined,
      segundoApellido: segundo_apellido?.trim() || undefined,
      tipoDocumento: tipo_documento ?? undefined,
      cedula: numero_documento?.trim() || undefined,
      celular: celular.trim(),
      email: email?.trim() || undefined,
      assignedTo: user.id,
    })
    if (!cliente) return NextResponse.json({ error: 'No se pudo crear el cliente' }, { status: 500 })

    const admin = createAdminClient()
    const datosActualizados: Record<string, string | boolean | null> = {
      en_seguimiento_ventas: true,
      // Si el cliente ya existía (mismo documento/celular) y nadie lo tenía
      // asignado, se asigna a quien lo está registrando ahora para que le
      // aparezca de inmediato en su propia lista de Seguimiento Ventas.
      assigned_to: cliente.assigned_to ?? user.id,
      primer_nombre: primer_nombre.trim(),
      segundo_nombre: segundo_nombre?.trim() || null,
      primer_apellido: primer_apellido?.trim() || null,
      segundo_apellido: segundo_apellido?.trim() || null,
      nombre: nombreCompleto,
      tipo_documento: tipo_documento || 'CC',
      cedula: numero_documento?.trim() || null,
      celular: celular.trim(),
      email: email?.trim() || null,
    }

    let { error } = await admin.from('clientes')
      .update(datosActualizados)
      .eq('id', cliente.id)
      .eq('tenant_id', perfil.tenant_id)

    // Si la migración de tipo_documento no se ha corrido todavía, no se debe
    // bloquear el guardado del resto de los datos por esa sola columna.
    if (error?.code === '42703') {
      delete datosActualizados.tipo_documento
      ;({ error } = await admin.from('clientes')
        .update(datosActualizados)
        .eq('id', cliente.id)
        .eq('tenant_id', perfil.tenant_id))
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, cliente_id: cliente.id })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al crear el cliente' }, { status: 500 })
  }
}
