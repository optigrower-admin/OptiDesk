import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renameDriveFolder, getOrCreateDriveSubfolder, moverDriveFile } from '@/lib/drive'

export const runtime = 'nodejs'

function nombreCarpetaFecha(d: Date, placaNorm: string): string {
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const anio = String(d.getFullYear()).slice(-2)
  return `${dia}_${mes}_${anio}_${placaNorm}`
}

/**
 * POST /api/admin/ordenes/renombrar-carpeta-drive
 *
 * Se llama cuando se corrige la placa de una orden que ya tiene material
 * subido a Drive. La carpeta de esta orden (ordenes.drive_folder_id) es la
 * subcarpeta "DD_MM_YY_PLACA" dentro de la carpeta de la placa vieja — hay
 * que renombrarla con la placa nueva Y moverla a la carpeta de la placa
 * nueva (creándola si no existe), en vez de dejar que la próxima subida
 * cree una carpeta nueva por no coincidir el nombre.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { orden_id: ordenId } = await req.json()
  if (!ordenId) return NextResponse.json({ error: 'Falta orden_id' }, { status: 400 })

  const { data: orden } = await supabase
    .from('ordenes').select('placa, drive_folder_id, tenant_id, created_at').eq('id', ordenId).single()

  if (!orden || orden.tenant_id !== perfil.tenant_id) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  }
  if (!orden.drive_folder_id) {
    // Nunca se subió nada a Drive todavía: no hay carpeta que renombrar,
    // se creará con el nombre correcto en la próxima subida.
    return NextResponse.json({ ok: true, renombrado: false })
  }

  const { data: tenant } = await supabase
    .from('tenants').select('google_refresh_token, drive_folder_id').eq('id', perfil.tenant_id).single()
  if (!tenant?.google_refresh_token || !tenant.drive_folder_id) {
    return NextResponse.json({ ok: true, renombrado: false })
  }

  const placaNorm = (orden.placa ?? 'SIN_PLACA').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()
  const carpetaFecha = nombreCarpetaFecha(orden.created_at ? new Date(orden.created_at) : new Date(), placaNorm)

  try {
    const folderRaw = tenant.drive_folder_id
    const folderId = folderRaw.includes('/')
      ? (folderRaw.split('/folders/')[1]?.split('?')[0] ?? folderRaw)
      : folderRaw
    const placaFolderNueva = await getOrCreateDriveSubfolder(folderId, placaNorm, tenant.google_refresh_token)

    // Obtener el padre actual de la carpeta de esta orden para poder moverla.
    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: tenant.google_refresh_token })
    const drive = google.drive({ version: 'v3', auth })
    const actual = await drive.files.get({ fileId: orden.drive_folder_id, fields: 'parents' })
    const parentActual = actual.data.parents?.[0]

    await renameDriveFolder(orden.drive_folder_id, carpetaFecha, tenant.google_refresh_token)
    if (parentActual && parentActual !== placaFolderNueva) {
      await moverDriveFile(orden.drive_folder_id, placaFolderNueva, parentActual, tenant.google_refresh_token)
    }
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'No se pudo renombrar la carpeta de Drive',
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, renombrado: true })
}
