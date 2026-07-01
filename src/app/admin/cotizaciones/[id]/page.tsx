import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFromR2 } from '@/lib/r2'
import { notFound } from 'next/navigation'
import CotizacionDoc from '@/components/CotizacionDoc'

async function imgToDataUri(r2Key: string | null | undefined): Promise<string> {
  if (!r2Key) return ''
  try {
    const buf = await downloadFromR2(r2Key)
    const ext = r2Key.split('.').pop()?.toLowerCase() ?? 'jpg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}

export default async function CotizacionPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return notFound()

  const admin = createAdminClient()

  const [{ data: cot }, { data: tenant }] = await Promise.all([
    admin.from('cotizaciones').select('*').eq('id', params.id).single(),
    admin.from('tenants').select('nombre, logo_url, cotizacion_tagline, cotizacion_direccion, cotizacion_telefono1, cotizacion_telefono2, cotizacion_email, cotizacion_web, cotizacion_whatsapp').eq('id', perfil.tenant_id).single(),
  ])

  if (!cot || cot.tenant_id !== perfil.tenant_id) return notFound()

  // Convertir fotos de las opciones a data URIs para que funcionen en la impresión PDF
  const opcionesConFotos = await Promise.all(
    (cot.opciones as OpcionCotizacion[]).map(async (op) => ({
      ...op,
      foto_frente_uri: await imgToDataUri(op.foto_frente_key),
      foto_lado_uri: await imgToDataUri(op.foto_lado_key),
      foto_promo_uri: await imgToDataUri(op.foto_promo_key),
    }))
  )

  // Logo del tenant
  let logoUri = ''
  if (tenant?.logo_url) {
    if (tenant.logo_url.startsWith('http')) {
      logoUri = tenant.logo_url
    } else {
      logoUri = await imgToDataUri(tenant.logo_url).catch(() => tenant.logo_url)
    }
  }

  return (
    <CotizacionDoc
      cotizacion={{
        ...cot,
        opciones: opcionesConFotos,
      }}
      tenant={{
        nombre: tenant?.nombre ?? '',
        logo_uri: logoUri,
        tagline: tenant?.cotizacion_tagline ?? '',
        direccion: tenant?.cotizacion_direccion ?? '',
        telefono1: tenant?.cotizacion_telefono1 ?? '',
        telefono2: tenant?.cotizacion_telefono2 ?? '',
        email: tenant?.cotizacion_email ?? '',
        web: tenant?.cotizacion_web ?? '',
        whatsapp: tenant?.cotizacion_whatsapp ?? '',
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
  mostrar_precio: boolean
}
