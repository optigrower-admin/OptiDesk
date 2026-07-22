import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { renameDriveFolder } from '@/lib/drive'

const CAMPOS_NOMBRE = new Set(['primer_nombre', 'segundo_nombre', 'primer_apellido', 'segundo_apellido', 'nombre', 'celular'])

function buildFolderName(nombre: string | null, celular: string | null): string {
  const n = (nombre ?? 'cliente').replace(/[<>:"/\\|?*]/g, '_').trim() || 'cliente'
  const c = (celular ?? '').replace(/\D/g, '')
  return c ? `${n} - ${c}` : n
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id, id, rol').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json()
  const { cliente_id, ...campos } = body as Record<string, unknown>
  if (!cliente_id)
    return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })

  const esGerencia = perfil.rol === 'gerencia' || perfil.rol === 'control_total'
  if ('assigned_to' in campos && !esGerencia) {
    delete campos.assigned_to
  }

  const admin = createAdminClient()

  const { data: clienteActual } = await admin
    .from('clientes')
    .select('id')
    .eq('id', cliente_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (!clienteActual) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const { error } = await admin
    .from('clientes')
    .update(campos)
    .eq('id', cliente_id)
    .eq('tenant_id', perfil.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Si cambió nombre o celular, renombrar carpeta en Drive (fire & forget)
  const afectaNombre = Object.keys(campos).some(k => CAMPOS_NOMBRE.has(k))
  if (afectaNombre) {
    renombrarCarpetaDrive(admin, cliente_id, perfil.tenant_id).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

async function renombrarCarpetaDrive(
  admin: ReturnType<typeof createAdminClient>,
  clienteId: string,
  tenantId: string,
) {
  const [clienteRes, tenantRes] = await Promise.all([
    admin.from('clientes').select('nombre, celular, drive_folder_id').eq('id', clienteId).single(),
    admin.from('tenants').select('google_refresh_token').eq('id', tenantId).single(),
  ])

  const folderId      = clienteRes.data?.drive_folder_id
  const refreshToken  = tenantRes.data?.google_refresh_token

  if (!folderId || !refreshToken) return

  const nuevoNombre = buildFolderName(clienteRes.data?.nombre ?? null, clienteRes.data?.celular ?? null)
  await renameDriveFolder(folderId, nuevoNombre, refreshToken)
}
