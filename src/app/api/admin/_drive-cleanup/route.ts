import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listDriveFolderFiles, deleteFromDrive } from '@/lib/drive'

// Endpoint TEMPORAL de mantenimiento — detecta y opcionalmente borra archivos
// huérfanos en Drive (subidos por reintentos fallidos de /migrar-a-drive
// antes del fix de permisos/count). Se elimina de la base de código después
// de usarse una vez. Protegido por un secreto que solo el operador conoce
// (no expuesto en ningún cliente).
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { tenantId?: string; borrar?: boolean } | null
  const tenantId = body?.tenantId
  const borrar = !!body?.borrar
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants').select('google_refresh_token').eq('id', tenantId).single()
  if (!tenant?.google_refresh_token) return NextResponse.json({ error: 'Sin google_refresh_token' }, { status: 400 })

  const { data: ordenes } = await admin
    .from('ordenes').select('id, numero, placa, drive_folder_id')
    .eq('tenant_id', tenantId).not('drive_folder_id', 'is', null)

  const { data: medios } = await admin
    .from('medios').select('id, url, orden_id, nombre_archivo')
    .eq('tenant_id', tenantId).eq('storage_location', 'drive')

  const idsValidos = new Set((medios ?? []).map(m => m.url))

  const resultado: { orden: number | null; placa: string | null; huerfanos: { id: string; name: string; size?: string }[] }[] = []
  let totalHuerfanos = 0
  let totalBorrados = 0
  const errores: string[] = []

  for (const orden of ordenes ?? []) {
    try {
      const archivos = await listDriveFolderFiles(orden.drive_folder_id as string, tenant.google_refresh_token)
      const huerfanos = archivos.filter(f =>
        !idsValidos.has(f.id) && (f.mimeType?.startsWith('video/') || f.mimeType?.startsWith('image/'))
      )
      if (!huerfanos.length) continue

      totalHuerfanos += huerfanos.length
      resultado.push({ orden: orden.numero, placa: orden.placa, huerfanos: huerfanos.map(f => ({ id: f.id, name: f.name, size: f.size })) })

      if (borrar) {
        for (const f of huerfanos) {
          try {
            await deleteFromDrive(f.id, tenant.google_refresh_token)
            totalBorrados++
          } catch (e) {
            errores.push(`${f.name} (${f.id}): ${e instanceof Error ? e.message : 'error'}`)
          }
        }
      }
    } catch (e) {
      errores.push(`orden #${orden.numero}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return NextResponse.json({ totalHuerfanos, totalBorrados, borrar, detalle: resultado, errores })
}
