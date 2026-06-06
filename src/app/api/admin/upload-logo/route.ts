import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
const MAX_BYTES = 3 * 1024 * 1024 // 3 MB

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios')
    .select('rol, tenant_id')
    .eq('id', user.id)
    .single()

  if (!perfil || !['control_total', 'admin', 'gerencia'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const tenant_id = formData.get('tenant_id') as string

  if (!file || !tenant_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Solo se permiten imágenes JPG, PNG, WebP o SVG' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'La imagen no puede superar 3 MB' }, { status: 400 })

  // Admin/gerencia solo puede cambiar el logo de su propia empresa
  if (perfil.rol !== 'control_total' && perfil.tenant_id !== tenant_id) {
    return NextResponse.json({ error: 'Sin permisos para esta empresa' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Asegurar que el bucket existe y es público
  await admin.storage.createBucket('logos', { public: true }).catch(() => {})

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${tenant_id}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  // Eliminar versión anterior si existe (diferente extensión)
  for (const e of ['png', 'jpg', 'jpeg', 'webp', 'svg']) {
    if (e !== ext) await admin.storage.from('logos').remove([`${tenant_id}/logo.${e}`]).catch(() => {})
  }

  const { error: uploadError } = await admin.storage
    .from('logos')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('logos').getPublicUrl(path)
  // Agregar cache-bust para que el navegador recargue la imagen
  const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`

  await admin.from('tenants').update({ logo_url: logoUrl }).eq('id', tenant_id)

  return NextResponse.json({ ok: true, logo_url: logoUrl })
}
