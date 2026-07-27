import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFromR2 } from '@/lib/r2'
import { redirect } from 'next/navigation'
import ListaMotosDoc, { type MotoFila, type TenantInfo } from '@/components/ListaMotosDoc'

// Redondea hacia arriba al múltiplo de 100 más cercano (ej: 20.158.450 -> 20.158.500).
function redondearArribaCentena(n: number): number {
  return Math.ceil(n / 100) * 100
}

async function toDataUri(key: string | null | undefined): Promise<string> {
  if (!key) return ''
  try {
    const buf = await downloadFromR2(key)
    const ext = key.split('.').pop()?.toLowerCase() ?? 'jpg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch { return '' }
}

export default async function ListaMotosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) redirect('/admin')

  const admin = createAdminClient()
  const tid = perfil.tenant_id

  // ── Tenant base (columnas que siempre existen) ──
  const { data: tenantBase } = await admin
    .from('tenants').select('nombre, logo_url').eq('id', tid).single()

  // ── Columnas de cotización (agregadas en migration_v61 — pueden faltar) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantExtra: Record<string, any> = {}
  const { data: te } = await admin.from('tenants')
    .select('cotizacion_tagline, cotizacion_telefono1, cotizacion_telefono2, cotizacion_email, cotizacion_web, cotizacion_whatsapp, recargo_tarjeta_porcentaje')
    .eq('id', tid).single()
  if (te) tenantExtra = te

  // ── Motos — solo columnas base ──
  const { data: motosBase } = await admin
    .from('motos_catalogo')
    .select('id, referencia, precio, costo_documentos, costo_prenda')
    .eq('tenant_id', tid).eq('activa', true).order('orden')

  // ── Specs (columnas nuevas, ignorar si no existen) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const specsMap: Record<string, Record<string, any>> = {}
  const { data: specs } = await admin.from('motos_catalogo')
    .select('id, cilindraje, potencia, frenos, garantia, colores, tagline_venta')
    .eq('tenant_id', tid).eq('activa', true)
  for (const s of specs ?? []) specsMap[s.id] = s

  // ── Fotos ──
  const fotoMap: Record<string, string> = {}
  const ids = (motosBase ?? []).map(m => m.id)
  if (ids.length > 0) {
    const { data: fotos } = await admin
      .from('motos_catalogo_fotos').select('moto_catalogo_id, tipo, r2_key').in('moto_catalogo_id', ids)
    for (const m of motosBase ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mf = (fotos ?? []).filter((f: any) => f.moto_catalogo_id === m.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const f = mf.find((f: any) => f.tipo === 'lado') ?? mf.find((f: any) => f.tipo === 'promocional') ?? mf.find((f: any) => f.tipo === 'frente') ?? null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (f) fotoMap[m.id] = await toDataUri((f as any).r2_key)
    }
  }

  // ── Logo ──
  const raw = tenantBase?.logo_url ?? ''
  const logoUri = raw.startsWith('http') ? raw : await toDataUri(raw)

  const recargo = Number(tenantExtra.recargo_tarjeta_porcentaje ?? 5)

  const rows: MotoFila[] = (motosBase ?? []).map(m => {
    const s = specsMap[m.id] ?? {}
    const conPapeles = m.precio + m.costo_documentos
    const pignorada  = conPapeles + m.costo_prenda
    return {
      id:               m.id,
      referencia:       m.referencia,
      tagline_venta:    s.tagline_venta ?? '',
      cilindraje:       s.cilindraje   ?? '',
      potencia:         s.potencia     ?? '',
      frenos:           s.frenos       ?? '',
      garantia:         s.garantia     ?? '',
      colores:          s.colores      ?? '',
      fotoUri:          fotoMap[m.id]  ?? '',
      sinPapeles:       m.precio,
      costoPapeles:     m.costo_documentos,
      conPapeles,
      pignorada,
      tarjetaPapeles:   redondearArribaCentena(conPapeles * (1 + recargo / 100)),
      tarjetaPignorada: redondearArribaCentena(pignorada  * (1 + recargo / 100)),
    }
  })

  const tenant: TenantInfo = {
    nombre:   tenantBase?.nombre ?? '',
    logoUri,
    tagline:  tenantExtra.cotizacion_tagline  ?? '',
    tel1:     tenantExtra.cotizacion_telefono1 ?? '',
    tel2:     tenantExtra.cotizacion_telefono2 ?? '',
    email:    tenantExtra.cotizacion_email     ?? '',
    web:      tenantExtra.cotizacion_web       ?? '',
    whatsapp: tenantExtra.cotizacion_whatsapp  ?? '',
    recargo,
  }

  const fecha = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

  return <ListaMotosDoc rows={rows} tenant={tenant} fecha={fecha} />
}
