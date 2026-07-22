import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function parseFolderId(raw: string): string {
  // Acepta URL completa o solo el ID
  const m = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : raw.trim()
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data: tenant } = await supabase
    .from('tenants')
    .select('documentos_folder_id, google_refresh_token')
    .eq('id', perfil!.tenant_id)
    .single()

  return NextResponse.json({
    folderId: tenant?.documentos_folder_id ?? null,
    driveConectado: !!tenant?.google_refresh_token,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { folderRaw } = await req.json() as { folderRaw: string }
  const folderId = folderRaw ? parseFolderId(folderRaw) : null

  const admin = createAdminClient()
  const { error: updateError } = await admin
    .from('tenants')
    .update({ documentos_folder_id: folderId })
    .eq('id', perfil!.tenant_id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ ok: true, folderId })
}
