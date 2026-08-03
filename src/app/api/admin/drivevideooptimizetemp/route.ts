import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFromDrive, replaceDriveFileContent } from '@/lib/drive'
import { convertirAMp4 } from '@/lib/video'

// Endpoint TEMPORAL de mantenimiento — re-comprime videos que ya están en
// Drive pero pesan más de 10 MB (subidos antes de que la migración
// garantizara el límite), manteniendo el mismo fileId. Se elimina de la
// base de código después de usarse una vez.
export const maxDuration = 300
export const runtime = 'nodejs'

const LIMITE_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { tenantId?: string; aplicar?: boolean; lote?: number } | null
  const tenantId = body?.tenantId
  const aplicar = !!body?.aplicar
  const lote = body?.lote ?? 3
  if (!tenantId) return NextResponse.json({ error: 'Falta tenantId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants').select('google_refresh_token').eq('id', tenantId).single()
  if (!tenant?.google_refresh_token) return NextResponse.json({ error: 'Sin google_refresh_token' }, { status: 400 })

  const { data: candidatos } = await admin
    .from('medios')
    .select('id, url, nombre_archivo, tamano_bytes, orden_id')
    .eq('tenant_id', tenantId)
    .eq('storage_location', 'drive')
    .eq('tipo', 'video')
    .gt('tamano_bytes', LIMITE_BYTES)
    .order('tamano_bytes', { ascending: false })
    .limit(aplicar ? lote : 200)

  const detalle: { id: string; nombre: string | null; antesMB: string; despuesMB?: string; ok: boolean; error?: string }[] = []

  for (const medio of candidatos ?? []) {
    const antesMB = ((medio.tamano_bytes ?? 0) / 1024 / 1024).toFixed(1)
    if (!aplicar) {
      detalle.push({ id: medio.id, nombre: medio.nombre_archivo, antesMB, ok: true })
      continue
    }
    try {
      const original = await downloadFromDrive(medio.url, tenant.google_refresh_token)
      const comprimido = await convertirAMp4(original, 'mp4')
      await replaceDriveFileContent(medio.url, 'video/mp4', comprimido, tenant.google_refresh_token)
      await admin.from('medios').update({ tamano_bytes: comprimido.length }).eq('id', medio.id)
      detalle.push({ id: medio.id, nombre: medio.nombre_archivo, antesMB, despuesMB: (comprimido.length / 1024 / 1024).toFixed(1), ok: true })
    } catch (e) {
      detalle.push({ id: medio.id, nombre: medio.nombre_archivo, antesMB, ok: false, error: e instanceof Error ? e.message : 'error' })
    }
  }

  const { count: restantes } = await admin
    .from('medios').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('storage_location', 'drive').eq('tipo', 'video').gt('tamano_bytes', LIMITE_BYTES)

  return NextResponse.json({ aplicar, procesados: detalle.length, detalle, restantes: restantes ?? 0 })
}
