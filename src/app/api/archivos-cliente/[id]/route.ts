import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedDownloadUrl, deleteFromR2 } from '@/lib/r2'
import { deleteFromDrive } from '@/lib/drive'
import { registrarAuditoria } from '@/lib/audit'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const { data: archivo } = await supabase.from('archivos_cliente')
    .select('url, storage_location, drive_url, tenant_id, nombre_archivo')
    .eq('id', params.id)
    .single()

  if (!archivo) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (archivo.tenant_id !== perfil.tenant_id) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  if (archivo.storage_location === 'drive') {
    return NextResponse.redirect(archivo.drive_url ?? '/', 302)
  }

  const signedUrl = await getSignedDownloadUrl(archivo.url, 3600, archivo.nombre_archivo ?? undefined)
  return NextResponse.redirect(signedUrl, 302)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const { data: archivo } = await supabase.from('archivos_cliente')
    .select('url, storage_location, tenant_id, tamano_bytes, subido_por, nombre_archivo, tipo, cliente_id')
    .eq('id', params.id)
    .single()

  if (!archivo) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (archivo.tenant_id !== perfil.tenant_id) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const puedeEliminar = perfil.rol === 'admin' || perfil.rol === 'gerencia' || perfil.rol === 'control_total' || archivo.subido_por === user.id
  if (!puedeEliminar) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  if (archivo.storage_location === 'r2') {
    try { await deleteFromR2(archivo.url) } catch { /* Si ya no existe, continuar */ }
  } else if (archivo.storage_location === 'drive') {
    const { data: tenant } = await supabase.from('tenants').select('google_refresh_token').eq('id', archivo.tenant_id).maybeSingle()
    if (tenant?.google_refresh_token) {
      try { await deleteFromDrive(archivo.url, tenant.google_refresh_token) } catch { /* Si ya no existe, continuar */ }
    }
  }

  await supabase.from('archivos_cliente').delete().eq('id', params.id)

  await registrarAuditoria(supabase, {
    tenant_id: archivo.tenant_id,
    tabla: 'archivos_cliente',
    registro_id: params.id,
    tipo: 'eliminacion',
    valor_anterior: { tipo: archivo.tipo, nombre_archivo: archivo.nombre_archivo, cliente_id: archivo.cliente_id },
    descripcion: `Eliminó un archivo (${archivo.nombre_archivo ?? 'sin nombre'})`,
    usuario_id: user.id,
  })

  if (archivo.tamano_bytes && archivo.storage_location === 'r2') {
    await supabase.rpc('decrement_tenant_storage', {
      p_tenant_id: archivo.tenant_id,
      p_bytes: archivo.tamano_bytes,
    })
  }

  return NextResponse.json({ ok: true })
}
