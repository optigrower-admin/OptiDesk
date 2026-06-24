import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createClient } from '@/lib/supabase/server'
import { archiveToLimit, LIMITE_TRIGGER_BYTES } from '@/lib/archiveToLimit'
import { registrarAuditoria } from '@/lib/audit'
import { downloadFromR2, uploadToR2, deleteFromR2 } from '@/lib/r2'
import { convertirAMp4 } from '@/lib/video'

export const maxDuration = 300

// Convierte el video a mp4 en segundo plano y actualiza el registro cuando
// termina — así la subida nunca espera a ffmpeg. waitUntil() le garantiza a
// Vercel que mantenga la función viva hasta que esta promesa termine, aunque
// la respuesta ya se haya devuelto al cliente.
async function convertirEnSegundoPlano(
  supabase: ReturnType<typeof createClient>,
  medioId: string,
  key: string,
  nombreArchivo: string,
  tenantId: string
) {
  try {
    const extOriginal = (key.split('.').pop() ?? 'mp4').toLowerCase()
    const original = await downloadFromR2(key)
    const convertido = Buffer.from(await convertirAMp4(original, extOriginal))

    const nuevaKey = key.replace(/\.[^./]+$/, '.mp4')
    const nuevoNombre = nombreArchivo.replace(/\.[^./]+$/, '.mp4')

    await uploadToR2(nuevaKey, convertido, 'video/mp4')
    if (nuevaKey !== key) await deleteFromR2(key).catch(() => {})

    // El tamaño original ya se contó en /api/upload/register — solo se ajusta
    // la diferencia contra el tamaño final convertido (normalmente más chico).
    const deltaBytes = convertido.length - original.length
    await supabase.from('medios').update({
      url: nuevaKey,
      nombre_archivo: nuevoNombre,
      tamano_bytes: convertido.length,
      procesando: false,
    }).eq('id', medioId)

    if (deltaBytes !== 0) {
      await supabase.rpc('increment_tenant_storage', { p_tenant_id: tenantId, p_bytes: deltaBytes })
    }
  } catch (e) {
    console.error('[upload/register] Error convirtiendo video a mp4 en segundo plano, se conserva el original:', e)
    // Se conserva el original tal cual — se quita el estado "procesando" para
    // que la galería al menos intente reproducirlo en vez de quedarse cargando.
    await supabase.from('medios').update({ procesando: false }).eq('id', medioId)
  }
}

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

  // Este registro viene de una subida directa a R2 (presign), que no pasa por
  // /api/upload — así que los videos llegan aquí en el formato original del
  // celular (mov, 3gpp, webm, etc.). Se registra YA con el archivo original
  // (para que aparezca de inmediato) y la conversión a mp4 corre después, en
  // segundo plano, sin que el usuario tenga que esperarla.
  const necesitaConversion = tipo === 'video' && !key.toLowerCase().endsWith('.mp4')

  const { data: medio, error: medioErr } = await supabase.from('medios').insert({
    orden_id,
    tenant_id: perfil.tenant_id,
    url: key,
    tipo,
    nombre_archivo,
    tamano_bytes: tamano_bytes ?? 0,
    storage_location: 'r2',
    subido_por: user.id,
    procesando: necesitaConversion,
  }).select('id, url, tipo, procesando').single()

  if (medioErr || !medio) {
    console.error('[upload/register] Error guardando el registro del medio:', medioErr)
    return NextResponse.json({ error: medioErr?.message ?? 'No se guardó el registro' }, { status: 500 })
  }

  await registrarAuditoria(supabase, {
    tenant_id: perfil.tenant_id,
    tabla: 'medios',
    registro_id: medio.id,
    tipo: 'movimiento',
    valor_nuevo: { tipo, nombre_archivo, orden_id },
    descripcion: `Subió ${tipo === 'video' ? 'un video' : 'una foto'} (${nombre_archivo}) a la orden`,
    usuario_id: user.id,
  })

  if (necesitaConversion) {
    waitUntil(convertirEnSegundoPlano(supabase, medio.id, key, nombre_archivo, perfil.tenant_id))
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

  return NextResponse.json(medio)
}
