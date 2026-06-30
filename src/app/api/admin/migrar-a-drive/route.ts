import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFromR2 } from '@/lib/r2'
import { uploadToDrive, getOrCreateDriveSubfolder } from '@/lib/drive'
import { convertirAMp4 } from '@/lib/video'

export const maxDuration = 300
export const runtime = 'nodejs'

const LOTE = 3  // archivos por llamada (Vercel puede tardar con videos grandes)

/**
 * POST /api/admin/migrar-a-drive
 *
 * Mueve fotos y videos de R2 a la carpeta de Google Drive del tenant,
 * organizados en sub-carpetas por placa. Se llama en lotes repetidos
 * hasta que `restantes` llegue a 0.
 *
 * Los videos se comprimen a < 10 MB antes de subir a Drive.
 * El archivo en R2 se mantiene como copia de seguridad; el registro
 * en medios apunta a Drive (storage_location = 'drive').
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!perfil || !['admin', 'gerencia', 'dueno', 'control_total'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  // El tenant_id viene del perfil del usuario. Para el rol control_total
  // (que no tiene tenant propio) se acepta un tenant_id explícito del query param.
  const tenantId = perfil.tenant_id ?? req.nextUrl.searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ error: 'Falta tenant_id' }, { status: 400 })

  const { data: tenant } = await supabase
    .from('tenants')
    .select('google_refresh_token, drive_folder_id')
    .eq('id', tenantId)
    .single()

  if (!tenant?.google_refresh_token) {
    return NextResponse.json({ error: 'Google Drive no conectado.' }, { status: 400 })
  }
  if (!tenant.drive_folder_id) {
    return NextResponse.json({ error: 'Carpeta de Drive no configurada.' }, { status: 400 })
  }

  const folderId = tenant.drive_folder_id.includes('/')
    ? (tenant.drive_folder_id.split('/folders/')[1]?.split('?')[0] ?? tenant.drive_folder_id)
    : tenant.drive_folder_id

  // Tomar un lote de medios aún en R2
  const { data: candidatos } = await supabase
    .from('medios')
    .select('id, url, nombre_archivo, tipo, tamano_bytes, ordenes(placa, numero)')
    .eq('tenant_id', tenantId)
    .eq('storage_location', 'r2')
    .limit(LOTE)

  const procesados: string[] = []
  const errores: { id: string; nombre: string; error: string }[] = []

  for (const medio of candidatos ?? []) {
    const ord = medio.ordenes as unknown as { placa: string | null; numero: number } | null
    const placa = (ord?.placa ?? 'SIN_PLACA').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()

    try {
      let buffer = await downloadFromR2(medio.url)
      let nombreArchivo = medio.nombre_archivo ?? medio.url.split('/').pop() ?? 'archivo'
      const mimeType = medio.tipo === 'video' ? 'video/mp4' : 'image/jpeg'

      // Videos: comprimir a < 10 MB y convertir a mp4
      if (medio.tipo === 'video') {
        const extOriginal = (medio.url.split('.').pop() ?? 'mp4').toLowerCase()
        try {
          buffer = await convertirAMp4(buffer, extOriginal)
          nombreArchivo = nombreArchivo.replace(/\.[^./]+$/, '.mp4')
        } catch (convErr) {
          console.error(`[migrar-drive] No se pudo comprimir ${medio.id}:`, convErr)
          // Se sube el original si la conversión falla
        }
      }

      // Crear sub-carpeta por placa dentro de la carpeta raíz
      const subFolderId = await getOrCreateDriveSubfolder(
        folderId,
        placa,
        tenant.google_refresh_token,
      )

      // Subir a Drive
      const { id: driveFileId, webViewLink } = await uploadToDrive(
        nombreArchivo,
        mimeType,
        buffer,
        subFolderId,
        tenant.google_refresh_token,
      )

      // Actualizar medios usando service role para evitar restricciones RLS.
      // Guarda el file ID de Drive en url (para CDN inline) y el webViewLink
      // en drive_url (para descargar/abrir en Drive).
      const admin = createAdminClient()
      const { error: updateErr, count: updateCount } = await admin.from('medios').update({
        url: driveFileId,
        storage_location: 'drive',
        drive_url: webViewLink,
        nombre_archivo: nombreArchivo,
        tamano_bytes: buffer.length,
      }).eq('id', medio.id)

      if (updateErr) throw new Error(`DB update: ${updateErr.message}`)
      if ((updateCount ?? 0) === 0) throw new Error('DB update: no se actualizó ningún registro (posible problema de permisos)')

      procesados.push(medio.id)
    } catch (e: unknown) {
      errores.push({
        id: medio.id,
        nombre: medio.nombre_archivo ?? medio.url,
        error: e instanceof Error ? e.message : 'Error desconocido',
      })
    }
  }

  // Usar service role para los conteos — la RLS puede filtrar filas y dar
  // números incorrectos al cliente autenticado normal.
  const adminCount = createAdminClient()
  const [{ count: restantes }, { count: enDrive }] = await Promise.all([
    adminCount.from('medios').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('storage_location', 'r2'),
    adminCount.from('medios').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('storage_location', 'drive'),
  ])

  return NextResponse.json({
    procesados: procesados.length,
    errores,
    restantes: restantes ?? 0,
    enDrive: enDrive ?? 0,
  })
}

/** GET: solo devuelve los conteos sin procesar nada. */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const tenantId = perfil.tenant_id ?? req.nextUrl.searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ enR2: 0, enDrive: 0 })

  const admin = createAdminClient()
  const [{ count: enR2 }, { count: enDrive }] = await Promise.all([
    admin.from('medios').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('storage_location', 'r2'),
    admin.from('medios').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('storage_location', 'drive'),
  ])

  return NextResponse.json({
    enR2: enR2 ?? 0,
    enDrive: enDrive ?? 0,
    _debugTenantId: tenantId,
    _debugPerfilTenantId: perfil.tenant_id,
    _debugQueryParam: req.nextUrl.searchParams.get('tenant_id'),
  })
}
