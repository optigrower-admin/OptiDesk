import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renameDriveFolder } from '@/lib/drive'

export const runtime = 'nodejs'

/**
 * POST /api/admin/ordenes/renombrar-carpeta-drive
 *
 * Se llama cuando se corrige la placa de una orden que ya tiene material
 * subido a Drive. Renombra la subcarpeta existente (ordenes.drive_folder_id)
 * en vez de dejar que la próxima subida cree una carpeta nueva por no
 * coincidir el nombre.
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
    .from('ordenes').select('placa, drive_folder_id, tenant_id').eq('id', ordenId).single()

  if (!orden || orden.tenant_id !== perfil.tenant_id) {
    return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  }
  if (!orden.drive_folder_id) {
    // Nunca se subió nada a Drive todavía: no hay carpeta que renombrar,
    // se creará con el nombre correcto en la próxima subida.
    return NextResponse.json({ ok: true, renombrado: false })
  }

  const { data: tenant } = await supabase
    .from('tenants').select('google_refresh_token').eq('id', perfil.tenant_id).single()
  if (!tenant?.google_refresh_token) {
    return NextResponse.json({ ok: true, renombrado: false })
  }

  const placaNorm = (orden.placa ?? 'SIN_PLACA').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()
  try {
    await renameDriveFolder(orden.drive_folder_id, placaNorm, tenant.google_refresh_token)
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'No se pudo renombrar la carpeta de Drive',
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, renombrado: true })
}
