import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive } from '@/lib/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    .select('documentos_folder_id, google_refresh_token')
    .eq('id', perfil!.tenant_id).single()

  if (!tenant?.documentos_folder_id)
    return NextResponse.json({ error: 'Carpeta Drive no configurada' }, { status: 400 })
  if (!tenant?.google_refresh_token)
    return NextResponse.json({ error: 'Google Drive no conectado' }, { status: 400 })

  // Buscar docs que aún están en Supabase Storage
  const { data: docs } = await admin
    .from('documentos_internos')
    .select('id, nombre, storage_path, mime_type')
    .eq('tenant_id', perfil!.tenant_id)
    .or('storage_location.is.null,storage_location.eq.supabase')

  if (!docs || docs.length === 0)
    return NextResponse.json({ ok: true, migrated: 0 })

  let migrated = 0
  const errores: string[] = []

  for (const doc of docs) {
    try {
      // Descargar desde Supabase Storage
      const { data: blob, error: dlErr } = await admin.storage
        .from('docs-internos')
        .download(doc.storage_path)

      if (dlErr || !blob) {
        errores.push(`${doc.nombre}: error descargando`)
        continue
      }

      const buffer = Buffer.from(await blob.arrayBuffer())

      // Subir a Drive
      const result = await uploadToDrive(
        doc.nombre + (doc.storage_path.match(/\.[^.]+$/) ? doc.storage_path.match(/\.[^.]+$/)![0] : ''),
        doc.mime_type ?? 'application/octet-stream',
        buffer,
        tenant.documentos_folder_id!,
        tenant.google_refresh_token,
      )

      // Actualizar BD
      await admin.from('documentos_internos').update({
        drive_file_id:    result.id,
        drive_url:        result.webViewLink,
        storage_location: 'drive',
      }).eq('id', doc.id)

      migrated++
    } catch (e) {
      errores.push(`${doc.nombre}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return NextResponse.json({ ok: true, migrated, errores })
}
