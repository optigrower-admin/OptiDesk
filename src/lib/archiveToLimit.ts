import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { downloadFromR2, deleteFromR2 } from '@/lib/r2'
import { uploadToDrive, getOrCreateDriveSubfolder } from '@/lib/drive'

export const LIMITE_TRIGGER_BYTES = 8 * 1024 * 1024 * 1024  // 8 GB
export const OBJETIVO_BYTES       = 5 * 1024 * 1024 * 1024  // 5 GB

export function extractDriveFolderId(value: string): string {
  const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : value.trim()
}

export interface TenantData {
  storage_usado_bytes: number
  archivado_drive_habilitado: boolean
  drive_folder_id: string | null
  google_refresh_token: string | null
}

interface MedioRow {
  id: string
  url: string
  tipo: string
  nombre_archivo: string | null
  tamano_bytes: number | null
  orden_id: string | null
  ordenes: { placa: string | null; numero: number; drive_folder_id: string | null } | null
}

export async function archiveToLimit(
  tenantId: string,
  tenant: TenantData,
  authClient: SupabaseClient,
  force = false,
): Promise<{ archivados: number; bytesLiberados: number; errores: string[] }> {
  const rawFolder = process.env.GOOGLE_DRIVE_FOLDER_ID ?? tenant.drive_folder_id ?? ''
  if (!rawFolder) {
    throw new Error('Carpeta de Drive no configurada. Configúrala en Empresas → Configurar.')
  }
  const driveFolder = extractDriveFolderId(rawFolder)

  if (!tenant.google_refresh_token && !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error(
      'Google Drive no conectado. Haz click en "Conectar con Google Drive" en la página de Storage.',
    )
  }

  const debeArchivar =
    force ||
    (tenant.archivado_drive_habilitado && tenant.storage_usado_bytes > LIMITE_TRIGGER_BYTES)
  if (!debeArchivar) return { archivados: 0, bytesLiberados: 0, errores: [] }

  // Usar admin client si está disponible, si no usar el cliente autenticado
  let db: SupabaseClient
  try {
    db = createAdminClient()
    const { error } = await db.from('tenants').select('id').eq('id', tenantId).single()
    if (error) throw error
  } catch {
    db = authClient
  }

  const { data: medios, error: mediosError } = await db
    .from('medios')
    .select('id, url, tipo, nombre_archivo, tamano_bytes, orden_id, ordenes(placa, numero, drive_folder_id)')
    .eq('tenant_id', tenantId)
    .eq('storage_location', 'r2')
    .order('created_at', { ascending: true })
    .limit(200)

  if (mediosError) throw new Error(`Error leyendo medios: ${mediosError.message}`)
  if (!medios?.length) return { archivados: 0, bytesLiberados: 0, errores: [] }

  let bytesLiberados = 0
  let archivados = 0
  const errores: string[] = []

  for (const medio of medios as unknown as MedioRow[]) {
    const storageActual = tenant.storage_usado_bytes - bytesLiberados
    if (!force && storageActual <= OBJETIVO_BYTES) break

    try {
      const placa    = (medio.ordenes?.placa ?? 'SIN_PLACA').replace(/[^a-zA-Z0-9]/g, '_')
      const numero   = medio.ordenes?.numero ?? 0
      const ext      = medio.tipo === 'video' ? 'mp4' : 'jpg'
      const fileName = `${placa}_#${numero}_${medio.id.slice(0, 8)}.${ext}`
      const mimeType = medio.tipo === 'video' ? 'video/mp4' : 'image/jpeg'

      // Reusar la subcarpeta ya asociada a la orden si existe, para no
      // duplicarla cuando la placa se corrigió después de la primera subida.
      let subFolderId = medio.ordenes?.drive_folder_id ?? null
      if (!subFolderId) {
        subFolderId = await getOrCreateDriveSubfolder(
          driveFolder, placa, tenant.google_refresh_token,
        )
        if (medio.orden_id) {
          await db.from('ordenes').update({ drive_folder_id: subFolderId }).eq('id', medio.orden_id)
        }
      }
      const buffer = await downloadFromR2(medio.url)
      const { webViewLink } = await uploadToDrive(
        fileName, mimeType, buffer, subFolderId, tenant.google_refresh_token,
      )

      await db
        .from('medios')
        .update({ storage_location: 'drive', drive_url: webViewLink })
        .eq('id', medio.id)

      await deleteFromR2(medio.url)

      bytesLiberados += medio.tamano_bytes ?? 0
      archivados++
    } catch (err: unknown) {
      errores.push(`${medio.id}: ${err instanceof Error ? err.message : 'error'}`)
    }
  }

  if (bytesLiberados > 0) {
    await db
      .from('tenants')
      .update({ storage_usado_bytes: Math.max(0, tenant.storage_usado_bytes - bytesLiberados) })
      .eq('id', tenantId)
  }

  return { archivados, bytesLiberados, errores }
}
