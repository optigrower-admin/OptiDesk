import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function requireTenant(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const
  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const
  return { perfil } as const
}

export async function GET() {
  const supabase = createClient()
  const chk = await requireTenant(supabase)
  if ('error' in chk) return chk.error

  const [{ data: secuencias }, { data: mensajes }] = await Promise.all([
    supabase.from('secuencias').select('*').eq('tenant_id', chk.perfil.tenant_id).order('created_at', { ascending: false }),
    supabase.from('secuencia_mensajes').select('*').eq('tenant_id', chk.perfil.tenant_id).order('orden'),
  ])

  return NextResponse.json({ secuencias: secuencias ?? [], mensajes: mensajes ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const chk = await requireTenant(supabase)
  if ('error' in chk) return chk.error
  if (!['gerencia', 'control_total'].includes(chk.perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const admin = createAdminClient()
  const body = await req.json()
  const accion = String(body.accion ?? '')

  if (accion === 'crear') {
    const nombre = String(body.nombre ?? '').trim()
    if (!nombre) return NextResponse.json({ error: 'Falta "nombre"' }, { status: 400 })
    const pasos = (body.pasos ?? []) as { contenido: string; dias_despues: number }[]

    const { data: secuencia, error } = await admin
      .from('secuencias').insert({ tenant_id: chk.perfil.tenant_id, nombre }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (pasos.length) {
      const filas = pasos.map((p, i) => ({
        secuencia_id: secuencia.id, tenant_id: chk.perfil.tenant_id, orden: i,
        contenido: p.contenido, dias_despues: p.dias_despues ?? 0,
      }))
      await admin.from('secuencia_mensajes').insert(filas)
    }
    return NextResponse.json({ ok: true, secuencia })
  }

  if (accion === 'editar') {
    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'Falta "id"' }, { status: 400 })
    const nombre = String(body.nombre ?? '').trim()
    const pasos = (body.pasos ?? []) as { contenido: string; dias_despues: number }[]

    if (nombre) {
      await admin.from('secuencias').update({ nombre, updated_at: new Date().toISOString() })
        .eq('id', id).eq('tenant_id', chk.perfil.tenant_id)
    }
    // Reemplaza los pasos completos (simple, suficiente para un CRUD básico)
    await admin.from('secuencia_mensajes').delete().eq('secuencia_id', id).eq('tenant_id', chk.perfil.tenant_id)
    if (pasos.length) {
      const filas = pasos.map((p, i) => ({
        secuencia_id: id, tenant_id: chk.perfil.tenant_id, orden: i,
        contenido: p.contenido, dias_despues: p.dias_despues ?? 0,
      }))
      await admin.from('secuencia_mensajes').insert(filas)
    }
    return NextResponse.json({ ok: true })
  }

  if (accion === 'toggle_activa') {
    const id = String(body.id ?? '')
    const activa = !!body.activa
    await admin.from('secuencias').update({ activa }).eq('id', id).eq('tenant_id', chk.perfil.tenant_id)
    return NextResponse.json({ ok: true })
  }

  if (accion === 'eliminar') {
    const id = String(body.id ?? '')
    await admin.from('secuencias').delete().eq('id', id).eq('tenant_id', chk.perfil.tenant_id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
