import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedDownloadUrl, deleteFromR2 } from '@/lib/r2'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const { data: medio } = await supabase.from('medios')
    .select('url, storage_location, drive_url, tenant_id, nombre_archivo')
    .eq('id', params.id)
    .single()

  if (!medio) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (medio.tenant_id !== perfil.tenant_id) {
    return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  }

  const isDownload = req.nextUrl.searchParams.get('download') === '1'

  if (medio.storage_location === 'drive') {
    return NextResponse.redirect(medio.drive_url ?? '/', 302)
  }

  const filename = isDownload ? (medio.nombre_archivo ?? undefined) : undefined
  const signedUrl = await getSignedDownloadUrl(medio.url, 3600, filename)
  return NextResponse.redirect(signedUrl, 302)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const { data: medio } = await supabase.from('medios')
    .select('url, storage_location, tenant_id, tamano_bytes, subido_por')
    .eq('id', params.id)
    .single()

  if (!medio) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (medio.tenant_id !== perfil.tenant_id) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const puedeEliminar = perfil.rol === 'admin' || perfil.rol === 'gerencia' || perfil.rol === 'control_total' || medio.subido_por === user.id
  if (!puedeEliminar) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  if (medio.storage_location === 'r2') {
    try { await deleteFromR2(medio.url) } catch { /* Si ya no existe, continuar */ }
  }

  await supabase.from('medios').delete().eq('id', params.id)

  if (medio.tamano_bytes && medio.storage_location === 'r2') {
    await supabase.rpc('decrement_tenant_storage', {
      p_tenant_id: medio.tenant_id,
      p_bytes: medio.tamano_bytes,
    })
  }

  return NextResponse.json({ ok: true })
}
