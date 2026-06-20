import { createClient } from '@/lib/supabase/server'
import { downloadFromR2, uploadToR2, deleteFromR2 } from '@/lib/r2'
import { convertirAMp4 } from '@/lib/video'
import { NextResponse } from 'next/server'

export const maxDuration = 120

/**
 * POST /api/admin/migrar-videos-mp4
 *
 * Convierte a mp4 real los videos de Servicio Técnico que ya estaban
 * guardados en R2 con otro formato (antes de que /api/upload empezara a
 * convertir automáticamente). Procesa un lote pequeño por llamada — el
 * frontend la llama repetidas veces hasta que `restantes` llegue a 0.
 * Los videos ya archivados en Google Drive (por cuota) no se tocan aquí.
 */
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  if (!['admin', 'gerencia', 'control_total'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { data: candidatos } = await supabase
    .from('medios')
    .select('id, url, nombre_archivo, tamano_bytes')
    .eq('tenant_id', perfil.tenant_id)
    .eq('tipo', 'video')
    .eq('storage_location', 'r2')
    .not('url', 'ilike', '%.mp4')
    .limit(3)

  const procesados: string[] = []
  const errores: { id: string; error: string }[] = []

  for (const medio of candidatos ?? []) {
    try {
      const extOriginal = (medio.url.split('.').pop() ?? 'mp4').toLowerCase()
      const original = await downloadFromR2(medio.url)
      const convertido = Buffer.from(await convertirAMp4(original, extOriginal))

      const nuevaKey = medio.url.replace(/\.[^./]+$/, '.mp4')
      const nuevoNombre = (medio.nombre_archivo ?? 'video').replace(/\.[^./]+$/, '.mp4')

      await uploadToR2(nuevaKey, convertido, 'video/mp4')
      if (nuevaKey !== medio.url) {
        await deleteFromR2(medio.url).catch(() => {})
      }

      await supabase.from('medios').update({
        url: nuevaKey,
        nombre_archivo: nuevoNombre,
        tamano_bytes: convertido.length,
      }).eq('id', medio.id)

      const diff = convertido.length - (medio.tamano_bytes ?? 0)
      if (diff !== 0) {
        await supabase.rpc(diff > 0 ? 'increment_tenant_storage' : 'decrement_tenant_storage', {
          p_tenant_id: perfil.tenant_id,
          p_bytes: Math.abs(diff),
        })
      }

      procesados.push(medio.id)
    } catch (e: unknown) {
      errores.push({ id: medio.id, error: e instanceof Error ? e.message : 'Error desconocido' })
    }
  }

  const { count: restantes } = await supabase
    .from('medios')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', perfil.tenant_id)
    .eq('tipo', 'video')
    .eq('storage_location', 'r2')
    .not('url', 'ilike', '%.mp4')

  const { count: enDrive } = await supabase
    .from('medios')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', perfil.tenant_id)
    .eq('tipo', 'video')
    .eq('storage_location', 'drive')

  return NextResponse.json({
    procesados: procesados.length,
    errores,
    restantes: restantes ?? 0,
    enDrive: enDrive ?? 0,
  })
}
