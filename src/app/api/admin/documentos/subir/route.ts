import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Recibe JSON con metadata + fileName/mimeType/fileSize
// Devuelve { doc, uploadUrl } — el cliente sube el archivo directo a Supabase
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json() as {
    nombre: string
    categoria: string
    fecha_emision: string | null
    fecha_vencimiento: string | null
    anotaciones: string | null
    fileName: string
    mimeType: string
    fileSize: number
  }

  const ext  = body.fileName.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `${perfil!.tenant_id}/${crypto.randomUUID()}.${ext}`

  const admin = createAdminClient()

  // Crear signed URL para que el cliente suba el archivo directamente
  const { data: signed, error: signErr } = await admin.storage
    .from('docs-internos')
    .createSignedUploadUrl(path)

  if (signErr) return NextResponse.json({ error: 'Error al crear URL de subida: ' + signErr.message }, { status: 500 })

  // Insertar registro en BD
  const { data: doc, error: dbErr } = await admin
    .from('documentos_internos')
    .insert({
      tenant_id:        perfil!.tenant_id,
      nombre:           body.nombre || body.fileName,
      storage_path:     path,
      mime_type:        body.mimeType || 'application/octet-stream',
      file_size:        body.fileSize,
      categoria:        body.categoria || 'General',
      fecha_emision:    body.fecha_emision || null,
      fecha_vencimiento: body.fecha_vencimiento || null,
      anotaciones:      body.anotaciones || null,
    })
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, doc, uploadUrl: signed.signedUrl })
}
