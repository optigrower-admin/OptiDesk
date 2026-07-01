'use client'
import type { OpcionCotizacion } from '@/app/admin/cotizaciones/[id]/page'

function cop(n: number) {
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}
function pad(n: number) { return String(n).padStart(4, '0') }
function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface TenantInfo {
  nombre: string; logo_uri: string; tagline: string
  direccion: string; telefono1: string; telefono2: string
  email: string; web: string; whatsapp: string
}
interface Cotizacion {
  id: string; numero: number; fecha_generacion: string; vigencia_dias: number
  cliente_nombre?: string; cliente_celular?: string; cliente_email?: string
  opciones: OpcionCotizacion[]; notas?: string
}
interface Props { cotizacion: Cotizacion; tenant: TenantInfo }

function Check({ color = '#0052B4' }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="12" fill={color}/>
      <path d="M7 12.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function CotizacionDoc({ cotizacion, tenant }: Props) {
  const whatsappNum  = tenant.whatsapp?.replace(/\D/g, '') ?? ''
  const whatsappLink = whatsappNum ? `https://wa.me/${whatsappNum}` : '#'
  const op           = cotizacion.opciones[0]

  // Fotos
  const fotoPromo  = op?.foto_promo_uri  || ''
  const fotoLado   = op?.foto_lado_uri   || op?.foto_promo_uri || op?.foto_frente_uri || ''
  const fotoFrente = op?.foto_frente_uri || ''
  // Fondo difuminado del header/footer: usa la promo o lateral
  const fotoBg     = op?.foto_promo_uri || op?.foto_lado_uri || ''

  // Precios
  const base      = op?.precio ?? 0
  const docs      = op?.costo_documentos ?? 0
  const prenda    = op?.costo_prenda ?? 0
  const conPapeles  = base + docs
  const pignorada   = base + docs + prenda
  const verContado  = op?.mostrar_contado  ?? op?.mostrar_precio ?? false
  const verPignorada= op?.mostrar_pignorada ?? false

  // Specs — solo los 4 más impactantes
  const specs = op ? [
    op.cilindraje    && { icon: '⚙️', label: op.cilindraje },
    op.frenos        && { icon: '🛡️', label: op.frenos },
    op.garantia      && { icon: '✅', label: op.garantia },
    op.caracteristica && { icon: '✨', label: op.caracteristica },
    op.potencia      && { icon: '⚡', label: op.potencia },
  ].filter(Boolean).slice(0, 4) as { icon: string; label: string }[] : []

  // Specs secundarios para el detalle
  const specsDetalle = op ? [
    op.cilindraje    && `Motor ${op.cilindraje}`,
    op.potencia      && op.potencia,
    op.frenos        && op.frenos,
    op.combustible   && op.combustible,
    op.rendimiento   && op.rendimiento,
    op.velocidad_max && `Vel. máx. ${op.velocidad_max}`,
    op.garantia      && op.garantia,
    op.caracteristica && op.caracteristica,
  ].filter(Boolean) as string[] : []

  const razones = [
    { icon: '🛡️', bg: '#dbeafe', title: 'Garantía real',         desc: 'Respaldo total en todas nuestras unidades.' },
    { icon: '🔧', bg: '#dcfce7', title: 'Taller propio',         desc: 'Mecánicos certificados y repuestos originales.' },
    { icon: '💳', bg: '#fce7f3', title: 'Facilidades de pago',   desc: 'Crédito con las mejores entidades del país.' },
    { icon: '🚚', bg: '#fef9c3', title: 'Entrega a domicilio',   desc: 'Llevamos tu moto hasta donde la necesites.' },
    { icon: '🎓', bg: '#ede9fe', title: 'Asesoría incluida',     desc: 'Te acompañamos en trámites y matrícula.' },
  ]

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body { margin: 0 !important; background: white !important; }
          .no-print { display: none !important; }
        }
        body { margin: 0; background: #e5e7eb; }
        * { box-sizing: border-box; }
      `}</style>

      {/* TOOLBAR */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white flex items-center justify-between px-6 py-3 shadow-lg">
        <button onClick={() => window.history.back()} className="text-sm text-gray-300 hover:text-white">← Volver</button>
        <span className="font-semibold text-sm">Cotización #{pad(cotizacion.numero)}</span>
        <div className="flex gap-3">
          {whatsappNum && (
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-sm font-semibold px-4 py-2 rounded-lg">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </a>
          )}
          <button onClick={() => window.print()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-sm font-semibold px-4 py-2 rounded-lg">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* DOCUMENTO */}
      <div className="no-print:mt-16 min-h-screen flex justify-center py-8 px-4 print:p-0 print:mt-0" style={{ background: '#e5e7eb' }}>
        <div style={{ width: '210mm', background: '#fff', boxShadow: '0 8px 60px rgba(0,0,0,0.2)', fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 11 }}>

          {/* ══ HEADER: Logo + número + contacto ══ */}
          <div style={{ background: 'linear-gradient(135deg, #001a5e 0%, #0035a0 50%, #0052B4 100%)', position: 'relative', overflow: 'hidden' }}>
            {/* Foto difuminada como ambiente — solo en el header */}
            {fotoBg && (
              <img src={fotoBg} alt="" aria-hidden style={{
                position: 'absolute', inset: -16,
                width: 'calc(100% + 32px)', height: 'calc(100% + 32px)',
                objectFit: 'cover', filter: 'blur(12px) saturate(0.7)',
                opacity: 0.18, zIndex: 0, pointerEvents: 'none',
              }} />
            )}
            {/* Overlay de color */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,26,94,0.92) 0%, rgba(0,52,160,0.82) 100%)', zIndex: 1 }} />

            <div style={{ position: 'relative', zIndex: 2, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              {/* Logo + tagline */}
              <div>
                {tenant.logo_uri
                  ? <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 50, objectFit: 'contain', filter: 'brightness(0) invert(1)', display: 'block', marginBottom: 5 }} />
                  : <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, textTransform: 'uppercase', marginBottom: 5 }}>{tenant.nombre}</div>
                }
                {tenant.tagline && <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8.5, letterSpacing: 2.5, textTransform: 'uppercase' }}>{tenant.tagline}</div>}
              </div>

              {/* Número de cotización */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Cotización</div>
                <div style={{ background: '#1a56db', color: '#fff', borderRadius: 6, padding: '4px 14px', fontSize: 17, fontWeight: 900, display: 'inline-block', letterSpacing: 0.5, marginBottom: 6 }}>
                  MS-{pad(cotizacion.numero)}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9 }}>📅 {formatFecha(cotizacion.fecha_generacion)}</div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8.5, marginTop: 2 }}>⏰ Válida por {cotizacion.vigencia_dias} días</div>
              </div>
            </div>

            {/* Contacto bar dentro del header */}
            <div style={{ position: 'relative', zIndex: 2, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexWrap: 'wrap' }}>
              {[
                { icon: '📍', text: tenant.direccion },
                { icon: '📞', text: [tenant.telefono1, tenant.telefono2].filter(Boolean).join(' · ') },
                { icon: '✉️', text: tenant.email },
                { icon: '🌐', text: tenant.web },
              ].filter(c => c.text).map(c => (
                <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', borderRight: '1px solid rgba(255,255,255,0.08)', flex: '1 1 auto' }}>
                  <span style={{ fontSize: 10 }}>{c.icon}</span>
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)' }}>{c.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ══ HERO: FOTO PROMOCIONAL GRANDE ══ */}
          {op && (
            <div style={{ background: 'linear-gradient(180deg, #f0f5ff 0%, #e8f0fe 100%)', borderBottom: '3px solid #0052B4' }}>
              <div style={{ display: 'grid', gridTemplateColumns: fotoFrente && fotoFrente !== fotoLado ? '1fr auto' : '1fr', gap: 0, alignItems: 'stretch' }}>

                {/* FOTO PRINCIPAL (promocional → lateral → frontal) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px 16px', minHeight: 200, position: 'relative' }}>
                  {(fotoPromo || fotoLado) ? (
                    <img
                      src={fotoPromo || fotoLado}
                      alt={op.referencia}
                      style={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 8px 24px rgba(0,52,180,0.18))' }}
                    />
                  ) : (
                    <div style={{ fontSize: 80, opacity: 0.3 }}>🏍️</div>
                  )}
                  {/* Etiqueta vista */}
                  {fotoPromo && <div style={{ position: 'absolute', bottom: 8, left: 16, fontSize: 7.5, color: '#94a3b8', fontWeight: 600 }}>Foto promocional</div>}
                  {!fotoPromo && fotoLado && <div style={{ position: 'absolute', bottom: 8, left: 16, fontSize: 7.5, color: '#94a3b8', fontWeight: 600 }}>Vista lateral</div>}
                </div>

                {/* FOTO FRENTE — columna derecha si es diferente */}
                {fotoFrente && fotoFrente !== fotoLado && (
                  <div style={{ width: 100, borderLeft: '1px solid #dde3f0', background: '#f8faff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 8px', gap: 6 }}>
                    <img src={fotoFrente} alt="frontal" style={{ maxHeight: 120, maxWidth: 84, objectFit: 'contain' }} />
                    <div style={{ fontSize: 7.5, color: '#94a3b8', fontWeight: 600, textAlign: 'center' }}>Vista frontal</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ NOMBRE + SPECS CHIPS + PRECIO — full width ══ */}
          {op && (
            <div style={{ padding: '16px 24px 14px', borderBottom: '1px solid #e8edf5' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'flex-start' }}>

                {/* Nombre + specs */}
                <div>
                  <div style={{ fontWeight: 900, fontSize: 22, color: '#001a5e', lineHeight: 1, letterSpacing: -0.5 }}>{op.referencia}</div>
                  {op.tagline_venta && <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', marginTop: 3 }}>{op.tagline_venta}</div>}
                  {specs.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {specs.map(s => (
                        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 20, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: '#1e40af' }}>
                          <span style={{ fontSize: 13 }}>{s.icon}</span> {s.label}
                        </span>
                      ))}
                      {op.colores && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 20, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: '#166534' }}>
                          🎨 {op.colores}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* PRECIO — tarjeta derecha */}
                <div style={{ background: '#0052B4', borderRadius: 14, padding: '14px 18px', minWidth: 178, textAlign: 'center', flexShrink: 0 }}>
                  {verContado ? (
                    <>
                      <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Precio de contado</div>
                      <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5 }}>{cop(conPapeles)}</div>
                      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8, marginTop: 3 }}>Con papeles · IVA incluido</div>
                    </>
                  ) : !verPignorada ? (
                    <>
                      <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Precio de contado</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                        <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>$</span>
                        <div style={{ width: 80, borderBottom: '2px solid rgba(255,255,255,0.5)', height: 20 }} />
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8, marginTop: 3 }}>A convenir</div>
                    </>
                  ) : null}

                  {verPignorada && (
                    <div style={{ marginTop: verContado ? 10 : 0, paddingTop: verContado ? 10 : 0, borderTop: verContado ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>
                      {!verContado && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Precio de contado</div>}
                      {verContado && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>En crédito (pignorada)</div>}
                      <div style={{ color: '#90d4f7', fontSize: verContado ? 17 : 22, fontWeight: 900, lineHeight: 1 }}>{cop(pignorada)}</div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8, marginTop: 2 }}>Incluye prenda · Con papeles</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ CUERPO: 2 columnas ══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '62% 38%', alignItems: 'start' }}>

            {/* ─── IZQUIERDA ─── */}
            <div style={{ padding: '16px 20px', borderRight: '1px solid #e8edf5' }}>

              {/* DATOS DEL CLIENTE */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <svg width="14" height="14" fill="#0052B4" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1 }}>Datos del cliente</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 14px' }}>
                  {[
                    ['Empresa / Nombre', cotizacion.cliente_nombre],
                    ['Contacto', ''],
                    ['Teléfono', cotizacion.cliente_celular],
                    ['Correo electrónico', cotizacion.cliente_email],
                    ['Dirección', ''],
                    ['Ciudad', ''],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', gap: 5, marginBottom: 6, alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 8.5, color: '#64748b', minWidth: 56, flexShrink: 0 }}>{label}:</span>
                      <span style={{ flex: 1, borderBottom: '1px solid #b8c4d8', paddingBottom: 1, fontSize: 8.5, color: val ? '#1a1a2e' : 'transparent', fontWeight: val ? 600 : 400 }}>{val ?? ' '}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, padding: '6px 10px', borderLeft: '3px solid #0052B4', background: '#f0f5ff', borderRadius: '0 7px 7px 0' }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 10, color: '#0052B4', lineHeight: 1.5 }}>
                    <strong>Cuéntanos lo que necesitas</strong> y te ayudamos a elegir la mejor opción.
                  </div>
                </div>
              </div>

              {/* DETALLES TÉCNICOS */}
              {specsDetalle.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingBottom: 4, borderBottom: '1.5px solid #dde3f0' }}>
                    Ficha técnica
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    {specsDetalle.map(s => (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Check />
                        <span style={{ fontSize: 9, color: '#334155' }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* QUÉ INCLUYE */}
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 14, border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>¿Qué incluye?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {['SOAT incluido', 'Matrícula + impuestos', 'Manual del propietario', 'Garantía de fábrica', 'Kit de herramientas', 'Asesoría en trámites'].map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Check color="#16a34a" />
                      <span style={{ fontSize: 8.5, color: '#166534', fontWeight: 500 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* OBSERVACIONES */}
              {cotizacion.notas && (
                <div style={{ border: '1px dashed #94a3b8', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Observaciones</div>
                  <div style={{ fontSize: 9, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{cotizacion.notas}</div>
                </div>
              )}
            </div>

            {/* ─── DERECHA (SIDEBAR) ─── */}
            <div style={{ padding: '16px 14px', background: '#f8faff', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Por qué elegirnos */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontWeight: 800, fontSize: 9.5, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, borderBottom: '2px solid #0052B4', paddingBottom: 5 }}>
                  ¿Por qué elegirnos?
                </div>
                {razones.map(({ icon, bg, title, desc }) => (
                  <div key={title} style={{ display: 'flex', gap: 9, marginBottom: 9, alignItems: 'flex-start' }}>
                    <div style={{ background: bg, borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 8.5, color: '#001a5e', textTransform: 'uppercase', letterSpacing: 0.3 }}>{title}</div>
                      <div style={{ fontSize: 8, color: '#475569', marginTop: 1, lineHeight: 1.4 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div style={{ background: '#0052B4', borderRadius: 12, padding: '14px 14px', textAlign: 'center' }}>
                <div style={{ fontWeight: 900, fontSize: 13, color: '#fff', marginBottom: 3 }}>¡APARTA HOY!</div>
                <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.7)', marginBottom: 12, lineHeight: 1.4 }}>
                  Estamos listos para atenderte ahora mismo.
                </div>
                {tenant.whatsapp && (
                  <div style={{ background: '#25d366', borderRadius: 8, padding: '8px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <span style={{ fontSize: 16 }}>📱</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 }}>WhatsApp</div>
                      <div style={{ fontWeight: 800, fontSize: 11, color: '#fff' }}>{tenant.whatsapp}</div>
                    </div>
                  </div>
                )}
                {[
                  { icon: '☎️', label: 'Llámanos',   val: tenant.telefono1 },
                  { icon: '✉️', label: 'Escríbenos', val: tenant.email    },
                ].filter(c => c.val).map(c => (
                  <div key={c.label} style={{ display: 'flex', gap: 7, marginBottom: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 13 }}>{c.icon}</span>
                    <span style={{ fontSize: 9, color: '#fff', fontWeight: 600 }}>{c.val}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 10, paddingTop: 10 }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'rgba(255,255,255,0.85)', fontSize: 11.5, lineHeight: 1.5 }}>
                    ¡Más que motos,<br /><strong>creamos experiencias!</strong>
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, textAlign: 'center' }}>
                  {[
                    { icon: '🛡️', t: 'GARANTÍA',  s: '12 MESES' },
                    { icon: '⭐', t: 'CALIDAD',    s: 'CERTIFICADA' },
                    { icon: '👍', t: 'CLIENTES',   s: 'FELICES' },
                  ].map(b => (
                    <div key={b.t}>
                      <div style={{ fontSize: 20, marginBottom: 3 }}>{b.icon}</div>
                      <div style={{ fontSize: 7, fontWeight: 800, color: '#0052B4', lineHeight: 1.2 }}>{b.t}</div>
                      <div style={{ fontSize: 6.5, color: '#64748b', fontWeight: 600 }}>{b.s}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ══ FOOTER: foto difuminada + CTA ══ */}
          <div style={{ position: 'relative', overflow: 'hidden', background: '#001a5e' }}>
            {fotoBg && (
              <img src={fotoBg} alt="" aria-hidden style={{
                position: 'absolute', inset: -16,
                width: 'calc(100% + 32px)', height: 'calc(100% + 32px)',
                objectFit: 'cover', filter: 'blur(14px) saturate(0.6)',
                opacity: 0.2, zIndex: 0, pointerEvents: 'none',
              }} />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,26,94,0.93) 0%, rgba(0,52,160,0.88) 100%)', zIndex: 1 }} />
            <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '14px 28px', gap: 16 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8, textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 2 }}>Tu próxima aventura</div>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, letterSpacing: -0.5, textTransform: 'uppercase', lineHeight: 1 }}>¡COMIENZA AQUÍ!</div>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', marginTop: 5 }}>⏰ Cotización válida por {cotizacion.vigencia_dias} días · Precios sujetos a cambio sin previo aviso.</div>
              </div>
              <div style={{ textAlign: 'center', maxWidth: 160 }}>
                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                  En {tenant.nombre || 'nuestro concesionario'} nos apasiona<br />acompañarte en cada kilómetro.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {tenant.logo_uri && <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 30, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
