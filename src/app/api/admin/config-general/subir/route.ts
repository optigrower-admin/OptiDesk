import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToR2, deleteFromR2 } from '@/lib/r2'

export const maxDuration = 60

const SECCIONES_VALIDAS = [
  'ventas', 'ordenes', 'repuestos', 'caja', 'clientes',
  'inventario', 'mensajes', 'reportes', 'cotizaciones', 'lista_precios',
]

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('tenant_id, rol')
    .eq('id', user.id)
    .single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })
  if (perfil.rol !== 'gerencia' && perfil.rol !== 'dueno')
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const form = await req.formData()
  const file    = form.get('file') as File | null
  const seccion = form.get('seccion') as string | null

  if (!file || !seccion) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  if (!SECCIONES_VALIDAS.includes(seccion))
    return NextResponse.json({ error: 'Sección inválida' }, { status: 400 })
  if (file.size > 30 * 1024 * 1024)
    return NextResponse.json({ error: 'El PDF no puede superar 30 MB' }, { status: 400 })

  const admin = createAdminClient()
  const { data: tenant } = await admin.from('tenants').select('manuales_config').eq('id', perfil.tenant_id).single()

  // Delete old key if exists
  const config = (tenant?.manuales_config ?? {}) as Record<string, string>
  if (config[seccion]) {
    await deleteFromR2(config[seccion]).catch(() => {})
  }

  const key = `manuales/${perfil.tenant_id}/${seccion}.pdf`
  const buf = Buffer.from(await file.arrayBuffer())
  await uploadToR2(key, buf, 'application/pdf')

  config[seccion] = key
  await admin.from('tenants').update({ manuales_config: config }).eq('id', perfil.tenant_id)

  return NextResponse.json({ ok: true, key })
}
