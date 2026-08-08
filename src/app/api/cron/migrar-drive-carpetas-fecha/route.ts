import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrCreateDriveSubfolder, moverDriveFile } from '@/lib/drive'
import { google } from 'googleapis'

export const runtime = 'nodejs'
export const maxDuration = 60

const TENANT_ID = 'f9126ff6-0fdf-4a62-a61b-ff07c60652a5'
const LOTE = 15 // órdenes por llamada, para no pasarse del tiempo límite

function getAuthClient(oauthRefreshToken: string) {
  const client = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET)
  client.setCredentials({ refresh_token: oauthRefreshToken })
  return client
}
function nombreCarpetaFecha(d: Date, placaNorm: string): string {
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const anio = String(d.getFullYear()).slice(-2)
  return `${dia}_${mes}_${anio}_${placaNorm}`
}

// Migración de un solo uso: reorganiza las fotos/videos ya subidos a Drive de
// una estructura plana "PLACA/archivos" a "PLACA/DD_MM_YY_PLACA/archivos".
// Se llama repetidas veces con ?cursor=N hasta que "listo:true".
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const cursor = Number(req.nextUrl.searchParams.get('cursor') ?? '0')

  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants')
    .select('google_refresh_token, drive_folder_id').eq('id', TENANT_ID).single()
  if (!tenant?.google_refresh_token || !tenant.drive_folder_id) {
    return NextResponse.json({ error: 'Tenant sin Drive configurado' }, { status: 400 })
  }
  const folderRaw = tenant.drive_folder_id as string
  const folderId = folderRaw.includes('/') ? (folderRaw.split('/folders/')[1]?.split('?')[0] ?? folderRaw) : folderRaw

  // Órdenes de servicio con al menos un medio en Drive, con paginación estable por id.
  const { data: medios } = await admin.from('medios')
    .select('orden_id')
    .eq('tenant_id', TENANT_ID).eq('storage_location', 'drive')
  const ordenIdsTodos = [...new Set((medios ?? []).map((m: { orden_id: string }) => m.orden_id))].sort()
  const ordenIdsLote = ordenIdsTodos.slice(cursor, cursor + LOTE)

  if (ordenIdsLote.length === 0) {
    return NextResponse.json({ listo: true, totalOrdenes: ordenIdsTodos.length, procesadas: cursor })
  }

  const { data: ordenes } = await admin.from('ordenes')
    .select('id, placa, numero, drive_folder_id, created_at')
    .in('id', ordenIdsLote)

  const auth = getAuthClient(tenant.google_refresh_token)
  const drive = google.drive({ version: 'v3', auth: auth as any })

  const resultados: { orden: number | null; ok: boolean; error?: string; archivosMovidos?: number }[] = []

  for (const orden of (ordenes ?? []) as { id: string; placa: string | null; numero: number | null; drive_folder_id: string | null; created_at: string }[]) {
    try {
      // No filtrar por orden.drive_folder_id: hay órdenes antiguas (de antes
      // de que se guardara ese campo) que ya tienen material en Drive pero
      // nunca quedó cacheado — igual hay que reorganizar sus archivos.
      const placaNorm = (orden.placa ?? 'SIN_PLACA').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()
      const carpetaFecha = nombreCarpetaFecha(new Date(orden.created_at), placaNorm)

      const placaFolderId = await getOrCreateDriveSubfolder(folderId, placaNorm, tenant.google_refresh_token)
      const fechaFolderId = await getOrCreateDriveSubfolder(placaFolderId, carpetaFecha, tenant.google_refresh_token)

      // Mover cada archivo de la carpeta vieja (plana) a la nueva carpeta por fecha.
      const { data: mediosOrden } = await admin.from('medios')
        .select('id, url').eq('orden_id', orden.id).eq('storage_location', 'drive')
      let movidos = 0
      for (const m of (mediosOrden ?? []) as { id: string; url: string }[]) {
        try {
          const f = await drive.files.get({ fileId: m.url, fields: 'parents' })
          const parentViejo = f.data.parents?.[0]
          if (parentViejo && parentViejo !== fechaFolderId) {
            await moverDriveFile(m.url, fechaFolderId, parentViejo, tenant.google_refresh_token)
            movidos++
          }
        } catch { /* archivo individual pudo haberse borrado manualmente, seguir con los demás */ }
      }

      await admin.from('ordenes').update({ drive_folder_id: fechaFolderId }).eq('id', orden.id)
      resultados.push({ orden: orden.numero, ok: true, archivosMovidos: movidos })
    } catch (err) {
      resultados.push({ orden: orden.numero, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({
    listo: false,
    totalOrdenes: ordenIdsTodos.length,
    procesadasHasta: cursor + ordenIdsLote.length,
    siguienteCursor: cursor + LOTE,
    resultados,
  })
}
