import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteFromDrive } from '@/lib/drive'

export const dynamic = 'force-dynamic'

async function autenticar(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? '')) return null
  return perfil
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const perfil = await autenticar(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await req.json() as {
    nombre?: string
    categoria?: string
    fecha_emision?: string | null
    fecha_vencimiento?: string | null
    anotaciones?: string | null
  }

  if ('fecha_emision' in body && body.fecha_emision === '') body.fecha_emision = null
  if ('fecha_vencimiento' in body && body.fecha_vencimiento === '') body.fecha_vencimiento = null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('documentos_internos')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('tenant_id', perfil.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ doc: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const perfil = await autenticar(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const admin = createAdminClient()

  const { data: doc } = await admin
    .from('documentos_internos')
    .select('storage_path, storage_location, drive_file_id')
    .eq('id', params.id)
    .eq('tenant_id', perfil.tenant_id)
    .single()

  if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  if (doc.storage_location === 'drive') {
    const fileId = doc.drive_file_id ?? doc.storage_path
    const { data: tenant } = await admin.from('tenants')
      .select('google_refresh_token').eq('id', perfil.tenant_id).single()
    try {
      await deleteFromDrive(fileId, tenant?.google_refresh_token)
    } catch {
      // Si falla la eliminación en Drive, continuar de todas formas
    }
  } else {
    await admin.storage.from('docs-internos').remove([doc.storage_path])
  }

  const { error } = await admin
    .from('documentos_internos')
    .delete()
    .eq('id', params.id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
