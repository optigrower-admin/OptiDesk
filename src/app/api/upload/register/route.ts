import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { archiveToLimit, LIMITE_TRIGGER_BYTES } from '@/lib/archiveToLimit'
import { registrarAuditoria } from '@/lib/audit'
import { downloadFromR2, uploadToR2, deleteFromR2 } from '@/lib/r2'
import { convertirAMp4 } from '@/lib/video'

export const maxDuration = 300

// Cada paso tiene su propio límite de tiempo para nunca colgar la petición
// indefinidamente. Se intentó antes hacer la conversión en segundo plano con
// waitUntil() de Vercel para responder rápido, pero en este proyecto la
// función se congelaba a medio camino sin terminar ni fallar (confirmado en
// logs: la conversión arrancaba y nunca volvía a aparecer ni éxito ni error).
// Una función "viva" atendiendo una petición real es la única garantía
// confiable de que Vercel la deja correr hasta el límite configurado — por
// eso la conversión se espera aquí mismo, de forma síncrona.
const TIMEOUT_PASO_MS = 250_000

function conTimeout<T>(promesa: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tiempo agotado en ${etiqueta} (${Math.round(ms / 1000)}s)`)), ms)
    promesa.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}

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
  // celular (mov, 3gpp, webm, etc.). Se convierten a mp4 real (H.264/AAC) aquí
  // mismo antes de guardar el registro, para que TODOS los videos de Servicio
  // Técnico salgan siempre reproducibles en cualquier dispositivo.
  if (tipo === 'video' && !key.toLowerCase().endsWith('.mp4')) {
    try {
      const extOriginal = (key.split('.').pop() ?? 'mp4').toLowerCase()
      console.log(`[upload/register] Convirtiendo ${key} (${tamano_bytes ?? '?'} bytes original)`)

      const original = await conTimeout(downloadFromR2(key), TIMEOUT_PASO_MS, 'descarga de R2')
      const convertido = Buffer.from(await conTimeout(convertirAMp4(original, extOriginal), TIMEOUT_PASO_MS, 'conversión ffmpeg'))

      const nuevaKey = key.replace(/\.[^./]+$/, '.mp4')
      const nuevoNombre = nombre_archivo.replace(/\.[^./]+$/, '.mp4')

      await conTimeout(uploadToR2(nuevaKey, convertido, 'video/mp4'), TIMEOUT_PASO_MS, 'subida a R2')
      if (nuevaKey !== key) await deleteFromR2(key).catch(() => {})

      key = nuevaKey
      nombre_archivo = nuevoNombre
      tamano_bytes = convertido.length
      console.log(`[upload/register] Conversión OK: ${key} (${tamano_bytes} bytes)`)
    } catch (e) {
      console.error('[upload/register] Error convirtiendo video a mp4, se conserva el original:', e)
    }
  }

  const { data: medio, error: medioErr } = await supabase.from('medios').insert({
    orden_id,
    tenant_id: perfil.tenant_id,
    url: key,
    tipo,
    nombre_archivo,
    tamano_bytes: tamano_bytes ?? 0,
    storage_location: 'r2',
    subido_por: user.id,
  }).select('id, url, tipo').single()

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
