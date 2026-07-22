import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive } from '@/lib/drive'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const nombre           = (formData.get('nombre') as string | null)?.trim() || file.name
  const categoria        = (formData.get('categoria') as string | null)?.trim() || 'General'
  const fecha_emision    = (formData.get('fecha_emision') as string | null) || null
  const fecha_vencimiento = (formData.get('fecha_vencimiento') as string | null) || null
  const anotaciones      = (formData.get('anotaciones') as string | null)?.trim() || null

  const admin = createAdminClient()

  // Obtener configuración Drive del tenant
  const { data: tenant } = await admin.from('tenants')
    .select('documentos_folder_id, google_refresh_token')
    .eq('id', perfil!.tenant_id).single()

  const buffer = Buffer.from(await file.arrayBuffer())

  let storage_location: 'drive' | 'supabase' = 'supabase'
  let storage_path: string | null = null
  let drive_file_id: string | null = null
  let drive_url: string | null = null

  if (tenant?.documentos_folder_id && tenant?.google_refresh_token) {
    // Subir a Google Drive
    const result = await uploadToDrive(
      file.name,
      file.type || 'application/octet-stream',
      buffer,
      tenant.documentos_folder_id,
      tenant.google_refresh_token,
    )
    drive_file_id    = result.id
    drive_url        = result.webViewLink
    storage_path     = result.id   // usamos el ID de Drive como referencia
    storage_location = 'drive'
  } else {
    // Fallback: Supabase Storage
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const path = `${perfil!.tenant_id}/${crypto.randomUUID()}.${ext}`

    const { error: signErr, data: signed } = await admin.storage
      .from('docs-internos')
      .createSignedUploadUrl(path)

    if (signErr || !signed)
      return NextResponse.json({ error: 'Error al preparar subida: ' + (signErr?.message ?? '') }, { status: 500 })

    // Subir directo al bucket
    const uploadRes = await fetch(signed.signedUrl, {
      method: 'PUT',
      body: buffer,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    })
    if (!uploadRes.ok)
      return NextResponse.json({ error: 'Error al subir a Supabase Storage' }, { status: 500 })

    storage_path     = path
    storage_location = 'supabase'
  }

  const { data: doc, error: dbErr } = await admin
    .from('documentos_internos')
    .insert({
      tenant_id:        perfil!.tenant_id,
      nombre,
      storage_path,
      drive_file_id,
      drive_url,
      storage_location,
      mime_type:        file.type || 'application/octet-stream',
      file_size:        file.size,
      categoria,
      fecha_emision:    fecha_emision || null,
      fecha_vencimiento: fecha_vencimiento || null,
      anotaciones,
    })
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, doc })
}
