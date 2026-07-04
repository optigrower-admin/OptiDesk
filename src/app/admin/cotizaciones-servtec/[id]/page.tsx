import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import CotizacionServTecDoc from '@/components/CotizacionServTecDoc'
import type { CotizacionServTec, TenantInfoST, ItemServTec } from '@/components/CotizacionServTecDoc'

async function imgToUri(key: string | null | undefined): Promise<string> {
  if (!key) return ''
  if (key.startsWith('http')) return key
  try {
    const { downloadFromR2 } = await import('@/lib/r2')
    const buf = await downloadFromR2(key)
    const ext = key.split('.').pop()?.toLowerCase() ?? 'jpg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch { return '' }
}

export default async function CotizacionServTecPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) redirect('/admin')

  const admin = createAdminClient()
  const tid = perfil.tenant_id

  const { data: cot } = await admin.from('cotizaciones_servtec').select('*').eq('id', params.id).single()
  if (!cot || cot.tenant_id !== tid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-5xl mb-4">🔧</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Cotización no encontrada</h1>
          <a href="/admin/cotizaciones-servtec" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">
            Volver
          </a>
        </div>
      </div>
    )
  }

  const { data: items } = await admin.from('cotizaciones_servtec_items')
    .select('*').eq('cotizacion_id', params.id).order('orden')

  // Tenant info
  const { data: tenBase } = await admin.from('tenants').select('nombre, logo_url').eq('id', tid).single()
  let tenantExtra: Record<string, string> = {}
  const { data: te1 } = await admin.from('tenants')
    .select('cotizacion_tagline, cotizacion_direccion, cotizacion_telefono1, cotizacion_email, cotizacion_web, cotizacion_whatsapp')
    .eq('id', tid).single()
  if (te1) tenantExtra = { ...te1 as Record<string, string> }

  // Config S.T. cotizaciones v68 — defensiva
  const { data: te68 } = await admin.from('tenants')
    .select('servtec_telefono1, servtec_telefono2, servtec_email, servtec_mensaje_cotizacion')
    .eq('id', tid).single()
  if (te68) tenantExtra = { ...tenantExtra, ...te68 as Record<string, string> }

  const logoUri = await imgToUri(tenBase?.logo_url)

  const cotizacion: CotizacionServTec = {
    id:               cot.id,
    numero:           cot.numero,
    fecha_generacion: cot.fecha_generacion,
    vigencia_dias:    cot.vigencia_dias,
    cliente_nombre:   cot.cliente_nombre,
    cliente_celular:  cot.cliente_celular,
    cliente_email:    cot.cliente_email,
    notas:            cot.notas,
    items:            (items ?? []) as ItemServTec[],
  }

  const tenant: TenantInfoST = {
    nombre:    tenBase?.nombre      ?? '',
    logo_uri:  logoUri,
    tagline:   tenantExtra.cotizacion_tagline    ?? '',
    direccion: tenantExtra.cotizacion_direccion  ?? '',
    telefono1:          tenantExtra.cotizacion_telefono1        ?? '',
    email:              tenantExtra.cotizacion_email            ?? '',
    web:                tenantExtra.cotizacion_web              ?? '',
    whatsapp:           tenantExtra.cotizacion_whatsapp         ?? '',
    servtec_telefono1:  tenantExtra.servtec_telefono1           ?? '',
    servtec_telefono2:  tenantExtra.servtec_telefono2           ?? '',
    servtec_email:      tenantExtra.servtec_email               ?? '',
    mensaje_cotizacion: tenantExtra.servtec_mensaje_cotizacion  ?? '',
  }

  return <CotizacionServTecDoc cotizacion={cotizacion} tenant={tenant} />
}
