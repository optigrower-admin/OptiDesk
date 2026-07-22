import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function extractFolderId(input: string): string | null {
  input = input.trim()
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9_-]+$/.test(input)) return input
  return null
}

async function autenticar(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, rol').eq('id', user.id).single()
  if (!['gerencia', 'dueno', 'control_total'].includes(perfil?.rol ?? '')) return null
  return perfil
}

export async function GET() {
  const supabase = createClient()
  const perfil = await autenticar(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants')
    .select('ventas_drive_folder_id, google_refresh_token')
    .eq('id', perfil.tenant_id).single()

  return NextResponse.json({
    ventas_drive_folder_id: tenant?.ventas_drive_folder_id ?? null,
    drive_connected: !!tenant?.google_refresh_token,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const perfil = await autenticar(supabase)
  if (!perfil) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { folder_url } = await req.json()
  const folderId = extractFolderId(folder_url ?? '')
  if (!folderId) return NextResponse.json({ error: 'URL o ID de carpeta inválido' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('tenants')
    .update({ ventas_drive_folder_id: folderId })
    .eq('id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, folder_id: folderId })
}
