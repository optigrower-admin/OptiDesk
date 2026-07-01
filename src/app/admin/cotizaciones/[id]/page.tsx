import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFromR2 } from '@/lib/r2'
import { redirect } from 'next/navigation'
import CotizacionDoc from '@/components/CotizacionDoc'

async function imgToDataUri(r2Key: string | null | undefined): Promise<string> {
  if (!r2Key) return ''
  try {
    const buf = await downloadFromR2(r2Key)
    const ext = r2Key.split('.').pop()?.toLowerCase() ?? 'jpg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch { return '' }
}

export default async function CotizacionPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) redirect('/admin')

  const admin = createAdminClient()
  const tid = perfil.tenant_id

  // Cotización
  const { data: cot } = await admin
    .from('cotizaciones').select('*').eq('id', params.id).single()

  if (!cot || cot.tenant_id !== tid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-5xl mb-4">📄</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Cotización no encontrada</h1>
          <p className="text-gray-500 text-sm mb-6">El enlace puede haber expirado o no tienes acceso.</p>
          <a href="/admin/ventas" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
            Volver a Ventas
          </a>
        </div>
      </div>
    )
  }

  // Tenant base (columnas que siempre existen)
  const { data: tenantBase } = await admin
    .from('tenants').select('nombre, logo_url').eq('id', tid).single()

  // Columnas de cotización (agregadas en migration_v61 — pueden no existir)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantExtra: Record<string, any> = {}
  const { data: te } = await admin.from('tenants')
    .select('cotizacion_tagline, cotizacion_direccion, cotizacion_telefono1, cotizacion_telefono2, cotizacion_email, cotizacion_web, cotizacion_whatsapp')
    .eq('id', tid).single()
  if (te) tenantExtra = te

  // Fotos de opciones → data URIs (para que queden embebidas en el PDF)
  const opcionesConFotos = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((cot.opciones ?? []) as any[]).map(async (op: OpcionCotizacion) => ({
      ...op,
      foto_frente_uri: await imgToDataUri(op.foto_frente_key),
      foto_lado_uri:   await imgToDataUri(op.foto_lado_key),
      foto_promo_uri:  await imgToDataUri(op.foto_promo_key),
    }))
  )

  // Logo
  const rawLogo = tenantBase?.logo_url ?? ''
  const logoUri = rawLogo.startsWith('http') ? rawLogo : await imgToDataUri(rawLogo)

  return (
    <CotizacionDoc
      cotizacion={{ ...cot, opciones: opcionesConFotos }}
      tenant={{
        nombre:    tenantBase?.nombre                 ?? '',
        logo_uri:  logoUri,
        tagline:   tenantExtra.cotizacion_tagline     ?? '',
        direccion: tenantExtra.cotizacion_direccion   ?? '',
        telefono1: tenantExtra.cotizacion_telefono1   ?? '',
        telefono2: tenantExtra.cotizacion_telefono2   ?? '',
        email:     tenantExtra.cotizacion_email       ?? '',
        web:       tenantExtra.cotizacion_web         ?? '',
        whatsapp:  tenantExtra.cotizacion_whatsapp    ?? '',
      }}
    />
  )
}

export type OpcionCotizacion = {
  moto_catalogo_id: string
  referencia: string
  tagline_venta?: string
  cilindraje?: string
  potencia?: string
  frenos?: string
  combustible?: string
  rendimiento?: string
  velocidad_max?: string
  garantia?: string
  colores?: string
  caracteristica?: string
  foto_frente_key?: string
  foto_lado_key?: string
  foto_promo_key?: string
  foto_frente_uri?: string
  foto_lado_uri?: string
  foto_promo_uri?: string
  precio: number
  costo_documentos: number
  costo_prenda: number
  mostrar_precio: boolean    // legacy, usar mostrar_contado/mostrar_pignorada
  mostrar_contado?: boolean
  mostrar_pignorada?: boolean
}
