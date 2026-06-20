import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { archiveToLimit, LIMITE_TRIGGER_BYTES } from '@/lib/archiveToLimit'
import { registrarAuditoria } from '@/lib/audit'
import { downloadFromR2, uploadToR2, deleteFromR2 } from '@/lib/r2'
import { convertirAMp4 } from '@/lib/video'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  let { orden_id, key, tipo, nombre_archivo, tamano_bytes } = await req.json() as {
    orden_id: string; key: string; tipo: 'imagen' | 'video'
    nombre_archivo: string; tamano_bytes: number
  }

  if (!orden_id || !key || !tipo || !nombre_archivo) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  // Este registro viene de una subida directa a R2 (presign), que no pasa por
  // /api/upload — así que los videos llegan aquí en el formato original del
  // celular (mov, 3gpp, webm, etc.). Los convertimos a mp4 real aquí también,
  // para que TODOS los videos de Servicio Técnico salgan siempre en mp4.
  if (tipo === 'video' && !key.toLowerCase().endsWith('.mp4')) {
    try {
      const extOriginal = (key.split('.').pop() ?? 'mp4').toLowerCase()
      const original = await downloadFromR2(key)
      const convertido = Buffer.from(await convertirAMp4(original, extOriginal))

      const nuevaKey = key.replace(/\.[^./]+$/, '.mp4')
      const nuevoNombre = nombre_archivo.replace(/\.[^./]+$/, '.mp4')

      await uploadToR2(nuevaKey, convertido, 'video/mp4')
      if (nuevaKey !== key) await deleteFromR2(key).catch(() => {})

      key = nuevaKey
      nombre_archivo = nuevoNombre
      tamano_bytes = convertido.length
    } catch (e) {
      console.error('[upload/register] Error convirtiendo video a mp4, se conserva el original:', e)
    }
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

  if (medio) {
    await registrarAuditoria(supabase, {
      tenant_id: perfil.tenant_id,
      tabla: 'medios',
      registro_id: medio.id,
      tipo: 'movimiento',
      valor_nuevo: { tipo, nombre_archivo, orden_id },
      descripcion: `Subió ${tipo === 'video' ? 'un video' : 'una foto'} (${nombre_archivo}) a la orden`,
      usuario_id: user.id,
    })
  }

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
