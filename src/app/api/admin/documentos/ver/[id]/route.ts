import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('No autorizado', { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? ''))
    return new NextResponse('Sin permiso', { status: 403 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('documentos_internos')
    .select('storage_path, mime_type, nombre')
    .eq('id', params.id)
    .eq('tenant_id', perfil!.tenant_id)
    .single()

  if (!doc) return new NextResponse('No encontrado', { status: 404 })

  const { data: blob, error } = await admin.storage
    .from('docs-internos')
    .download(doc.storage_path)

  if (error || !blob) return new NextResponse('Error al descargar', { status: 500 })

  const buffer = Buffer.from(await blob.arrayBuffer())

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': doc.mime_type ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
