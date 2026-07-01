import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { downloadFromR2 } from '@/lib/r2'
import { notFound } from 'next/navigation'

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

function formatCOP(n: number) {
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

export default async function ListaPreciosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return notFound()

  const admin = createAdminClient()
  const [{ data: tenant }, { data: motos }] = await Promise.all([
    admin.from('tenants')
      .select('nombre, logo_url, cotizacion_tagline, cotizacion_telefono1, cotizacion_telefono2, cotizacion_email, cotizacion_web, cotizacion_whatsapp, recargo_tarjeta_porcentaje')
      .eq('id', perfil.tenant_id).single(),
    admin.from('motos_catalogo')
      .select('id, referencia, precio, costo_documentos, costo_prenda, cilindraje, potencia, frenos, garantia, colores, motos_catalogo_fotos(tipo, r2_key)')
      .eq('tenant_id', perfil.tenant_id).eq('activa', true).order('orden'),
  ])

  if (!tenant || !motos) return notFound()

  const recargoTarjeta = (tenant.recargo_tarjeta_porcentaje as number) ?? 5

  // Convertir logo a data URI
  let logoUri = ''
  if (tenant.logo_url) {
    if (tenant.logo_url.startsWith('http')) logoUri = tenant.logo_url
    else logoUri = await imgToDataUri(tenant.logo_url).catch(() => tenant.logo_url)
  }

  // Foto principal de cada moto (preferir 'lado', luego 'promo', luego 'frente')
  type MotoFoto = { tipo: string; r2_key: string }
  const motosConFotos = await Promise.all(motos.map(async (m) => {
    const fotos = (m.motos_catalogo_fotos as MotoFoto[]) ?? []
    const foto = fotos.find(f => f.tipo === 'lado') ?? fotos.find(f => f.tipo === 'promo') ?? fotos.find(f => f.tipo === 'frente') ?? fotos[0]
    const fotoUri = foto ? await imgToDataUri(foto.r2_key) : ''
    return {
      ...m,
      fotoUri,
      conPapeles: m.precio + m.costo_documentos,
      conPrenda:  m.precio + m.costo_documentos + m.costo_prenda,
      conTarjeta: Math.round((m.precio + m.costo_documentos) * (1 + recargoTarjeta / 100)),
    }
  }))

  const fecha = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 12mm 10mm; size: A4 portrait; }
          body { margin: 0 !important; }
          .no-print { display: none !important; }
        }
        body { margin: 0; background: #f3f4f6; font-family: 'Segoe UI', Arial, sans-serif; }
      `}</style>

      {/* Toolbar — solo pantalla */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white flex items-center justify-between px-6 py-3">
        <button onClick={() => window.history.back()} className="text-sm text-gray-300 hover:text-white">← Volver</button>
        <span className="font-semibold text-sm">Lista de precios</span>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
          Imprimir / PDF
        </button>
      </div>

      <div className="no-print:mt-16 min-h-screen bg-gray-100 flex justify-center py-8 px-4 print:p-0 print:bg-white print:mt-0">
        <div style={{ width: '210mm', background: '#fff', boxShadow: '0 4px 40px rgba(0,0,0,0.12)' }}>

          {/* ── ENCABEZADO ── */}
          <div style={{ background: 'linear-gradient(135deg, #0035a0 0%, #0052B4 60%, #0066cc 100%)', padding: '24px 32px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              {logoUri && <img src={logoUri} alt="Logo" style={{ height: 44, objectFit: 'contain', marginBottom: 6, filter: 'brightness(0) invert(1)' }} />}
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tenant.nombre}</div>
              {tenant.cotizacion_tagline && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>{tenant.cotizacion_tagline}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fff', fontSize: 20, fontWeight: 900 }}>LISTA DE PRECIOS</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 4 }}>Fecha: {fecha}</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 2 }}>Precios sujetos a cambios sin previo aviso</div>
            </div>
          </div>

          {/* Barra contacto */}
          <div style={{ background: '#003087', display: 'flex', gap: 20, padding: '8px 32px', flexWrap: 'wrap' }}>
            {tenant.cotizacion_telefono1 && (
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10 }}>📞 {tenant.cotizacion_telefono1}{tenant.cotizacion_telefono2 ? ` / ${tenant.cotizacion_telefono2}` : ''}</span>
            )}
            {tenant.cotizacion_email && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10 }}>✉️ {tenant.cotizacion_email}</span>}
            {tenant.cotizacion_web    && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10 }}>🌐 {tenant.cotizacion_web}</span>}
            {tenant.cotizacion_whatsapp && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10 }}>📱 WhatsApp: {tenant.cotizacion_whatsapp}</span>}
          </div>

          {/* ── LEYENDA DE COLUMNAS ── */}
          <div style={{ padding: '16px 32px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 105px 105px 105px', gap: 8, padding: '8px 10px', background: '#0052B4', borderRadius: 8 }}>
              <div style={{ color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Modelo</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Sin papeles</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Con papeles</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Pignorada</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Tarjeta (+{recargoTarjeta}%)</div>
            </div>
          </div>

          {/* ── LISTA DE MOTOS ── */}
          <div style={{ padding: '8px 32px 24px' }}>
            {motosConFotos.map((m, idx) => (
              <div key={m.id} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 105px 105px 105px',
                gap: 8,
                alignItems: 'center',
                padding: '10px',
                background: idx % 2 === 0 ? '#f8fafc' : '#fff',
                borderBottom: '1px solid #e2e8f0',
                borderRadius: 6,
                marginTop: 4,
              }}>
                {/* Moto info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {m.fotoUri ? (
                    <img src={m.fotoUri} alt={m.referencia} style={{ width: 64, height: 48, objectFit: 'contain', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 64, height: 48, background: '#f1f5f9', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 20 }}>🏍️</span>
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>{m.referencia}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      {m.cilindraje && <span style={{ fontSize: 9, background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>⚙️ {m.cilindraje}</span>}
                      {m.potencia   && <span style={{ fontSize: 9, background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>⚡ {m.potencia}</span>}
                      {m.frenos     && <span style={{ fontSize: 9, background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>🛡️ {m.frenos}</span>}
                      {m.garantia   && <span style={{ fontSize: 9, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>✅ {m.garantia}</span>}
                    </div>
                    {m.colores && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>🎨 {m.colores}</div>}
                  </div>
                </div>

                {/* Precios */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{formatCOP(m.precio)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#059669' }}>{formatCOP(m.conPapeles)}</div>
                  <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>SOAT + matrícula</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8' }}>{formatCOP(m.conPrenda)}</div>
                  <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>Crédito pignorado</div>
                </div>
                <div style={{ textAlign: 'right', background: '#fffbeb', borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#b45309' }}>{formatCOP(m.conTarjeta)}</div>
                  <div style={{ fontSize: 9, color: '#92400e', marginTop: 1 }}>Pago con tarjeta</div>
                </div>
              </div>
            ))}

            {motosConFotos.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>
                Sin motos activas en el catálogo
              </div>
            )}
          </div>

          {/* ── PIE ── */}
          <div style={{ background: '#003087', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontStyle: 'italic' }}>
              * Precios en pesos colombianos. Incluyen papeles: SOAT, matrícula e impuestos.<br />
              * Tarjeta aplica el {recargoTarjeta}% sobre el precio con papeles. Los precios pueden cambiar sin previo aviso.
            </div>
            {logoUri && <img src={logoUri} alt="Logo" style={{ height: 28, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.8 }} />}
          </div>

        </div>
      </div>
    </>
  )
}
