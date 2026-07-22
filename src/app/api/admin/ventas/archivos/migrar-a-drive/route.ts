import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive, getOrCreateDriveSubfolder } from '@/lib/drive'
import { downloadFromR2, deleteFromR2 } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function buildFolderName(nombre: string | null, celular: string | null): string {
  const n = (nombre ?? 'cliente').replace(/[<>:"/\\|?*]/g, '_').trim() || 'cliente'
  const c = (celular ?? '').replace(/\D/g, '')
  return c ? `${n} - ${c}` : n
}

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const admin = createAdminClient()

  const { data: tenant } = await admin.from('tenants')
    .select('ventas_drive_folder_id, google_refresh_token')
    .eq('id', perfil!.tenant_id).single()

  if (!tenant?.ventas_drive_folder_id)
    return NextResponse.json({ error: 'Carpeta Drive no configurada en Config Ventas' }, { status: 400 })
  if (!tenant?.google_refresh_token)
    return NextResponse.json({ error: 'Google Drive no conectado' }, { status: 400 })

  const { ventas_drive_folder_id, google_refresh_token } = tenant

  // Archivos de clientes aún en R2
  const { data: archivos } = await admin
    .from('archivos_cliente')
    .select('id, cliente_id, url, nombre_archivo, mime_type, tipo, tamano_bytes')
    .eq('tenant_id', perfil!.tenant_id)
    .or('storage_location.is.null,storage_location.eq.r2')

  if (!archivos || archivos.length === 0)
    return NextResponse.json({ ok: true, migrated: 0 })

  // Cargar datos de clientes únicos de una sola vez
  const clienteIds = [...new Set(archivos.map(a => a.cliente_id))]
  const { data: clientes } = await admin
    .from('clientes')
    .select('id, nombre, celular, drive_folder_id')
    .in('id', clienteIds)

  const clienteMap = new Map((clientes ?? []).map(c => [c.id, c]))
  const folderCache = new Map<string, string>() // clienteId → subfolderId

  let migrated = 0
  const errores: string[] = []

  for (const archivo of archivos) {
    try {
      const cliente = clienteMap.get(archivo.cliente_id)

      // Obtener o crear subcarpeta del cliente
      let subfolderId = folderCache.get(archivo.cliente_id)
      if (!subfolderId) {
        if (cliente?.drive_folder_id) {
          subfolderId = cliente.drive_folder_id
        } else {
          const folderName = buildFolderName(cliente?.nombre ?? null, cliente?.celular ?? null)
          subfolderId = await getOrCreateDriveSubfolder(ventas_drive_folder_id, folderName, google_refresh_token)
          // Guardar ID en la BD del cliente
          await admin.from('clientes')
            .update({ drive_folder_id: subfolderId })
            .eq('id', archivo.cliente_id)
          if (cliente) cliente.drive_folder_id = subfolderId
        }
        folderCache.set(archivo.cliente_id, subfolderId)
      }

      // Descargar de R2
      const buffer = await downloadFromR2(archivo.url)

      // Subir a Drive
      const mime = archivo.mime_type ?? 'application/octet-stream'
      const result = await uploadToDrive(
        archivo.nombre_archivo ?? archivo.url.split('/').pop() ?? 'archivo',
        mime,
        buffer,
        subfolderId,
        google_refresh_token,
      )

      // Actualizar registro
      await admin.from('archivos_cliente').update({
        url:              result.id,
        drive_url:        result.webViewLink,
        storage_location: 'drive',
      }).eq('id', archivo.id)

      // Eliminar de R2 para liberar espacio
      await deleteFromR2(archivo.url)

      migrated++
    } catch (e) {
      errores.push(`${archivo.nombre_archivo ?? archivo.id}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return NextResponse.json({ ok: true, migrated, total: archivos.length, errores })
}
