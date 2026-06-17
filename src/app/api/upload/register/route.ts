import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { archiveToLimit, LIMITE_TRIGGER_BYTES } from '@/lib/archiveToLimit'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const { orden_id, key, tipo, nombre_archivo, tamano_bytes } = await req.json() as {
    orden_id: string; key: string; tipo: 'imagen' | 'video'
    nombre_archivo: string; tamano_bytes: number
  }

  if (!orden_id || !key || !tipo || !nombre_archivo) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const { data: medio } = await supabase.from('medios').insert({
    orden_id,
    tenant_id: perfil.tenant_id,
    url: key,
    tipo,
    nombre_archivo,
    tamano_bytes: tamano_bytes ?? 0,
    storage_location: 'r2',
    subido_por: user.id,
  }).select('id, url, tipo').single()

  await supabase.rpc('increment_tenant_storage', {
    p_tenant_id: perfil.tenant_id,
    p_bytes: tamano_bytes ?? 0,
  })

  const { data: tenantPost } = await supabase
    .from('tenants')
    .select('storage_usado_bytes, archivado_drive_habilitado, drive_folder_id, google_refresh_token')
    .eq('id', perfil.tenant_id)
    .single()

  if (tenantPost?.archivado_drive_habilitado && tenantPost.storage_usado_bytes > LIMITE_TRIGGER_BYTES) {
    archiveToLimit(perfil.tenant_id, tenantPost, supabase).catch(() => {})
  }

  return NextResponse.json(medio ?? { error: 'No se guardó el registro' })
}
