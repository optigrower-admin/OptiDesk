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

  const fotoPromo  = op?.foto_promo_uri  || ''   // esquina header
  const fotoLado   = op?.foto_lado_uri   || op?.foto_promo_uri || op?.foto_frente_uri || ''
  const fotoFrente = op?.foto_frente_uri || ''

  const base       = op?.precio ?? 0
  const docs       = op?.costo_documentos ?? 0
  const prenda     = op?.costo_prenda ?? 0
  const conPapeles = base + docs
  const pignorada  = base + docs + prenda
  const verContado   = op?.mostrar_contado  ?? op?.mostrar_precio ?? false
  const verPignorada = op?.mostrar_pignorada ?? false

  const specsCheck = op ? [
    op.cilindraje    && `Motor ${op.cilindraje}`,
    op.potencia      && op.potencia,
    op.frenos        && op.frenos,
    op.combustible   && op.combustible,
    op.rendimiento   && op.rendimiento,
    op.velocidad_max && `Vel. máx. ${op.velocidad_max}`,
    op.garantia      && op.garantia,
    op.caracteristica && op.caracteristica,
  ].filter(Boolean) as string[] : []

  // Chips de specs (los 3-4 más impactantes para el header de la moto)
  const specsChips = op ? [
    op.cilindraje    && { icon: '⚙️', label: op.cilindraje },
    op.frenos        && { icon: '🛡️', label: op.frenos },
    op.garantia      && { icon: '✅', label: op.garantia },
    op.caracteristica && { icon: '✨', label: op.caracteristica },
  ].filter(Boolean).slice(0, 4) as { icon: string; label: string }[] : []

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 0; size: letter portrait; }
          body { margin: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          /* Forzar impresión de fondos, gradientes e imágenes en Chrome/Edge/Firefox */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* Escalar todo al 88 % para que quepa en una sola hoja */
          .cot-scale {
            transform: scale(0.88);
            transform-origin: top left;
            width: 113.64%;   /* 100% / 0.88 — compensa el encogimiento horizontal */
          }
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
        <div className="cot-scale" style={{ width: '210mm', background: '#fff', boxShadow: '0 8px 60px rgba(0,0,0,0.2)', fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 11 }}>

          {/* ══ HEADER ══════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'stretch', background: '#fff', borderBottom: '3px solid #0052B4' }}>

            {/* Izquierda: Logo + gradiente azul */}
            <div style={{ background: 'linear-gradient(135deg, #001a5e 0%, #0035a0 55%, #0052B4 100%)', padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
              <div>
                {tenant.logo_uri
                  ? <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 52, objectFit: 'contain', filter: 'brightness(0) invert(1)', display: 'block', marginBottom: 8 }} />
                  : <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>{tenant.nombre}</div>
                }
                {tenant.tagline && <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8.5, letterSpacing: 2.5, textTransform: 'uppercase' }}>{tenant.tagline}</div>}
              </div>

              {/* Contacto en barra inferior del header */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {[
                  { icon: '📍', text: tenant.direccion },
                  { icon: '📞', text: [tenant.telefono1, tenant.telefono2].filter(Boolean).join(' · ') },
                  { icon: '✉️', text: tenant.email },
                  { icon: '🌐', text: tenant.web },
                ].filter(c => c.text).map(c => (
                  <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 10 }}>{c.icon}</span>
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.75)' }}>{c.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Derecha: FOTO PROMOCIONAL en cuadrado + número de cotización */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', background: '#f0f5ff', padding: '0', minWidth: 112, maxWidth: 112, borderLeft: '2px solid #0052B4', overflow: 'hidden' }}>

              {/* Foto promocional — cuadrado pequeño esquina superior derecha */}
              <div style={{ width: '100%', flex: 1, background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 88, position: 'relative', overflow: 'hidden' }}>
                {fotoPromo ? (
                  <img
                    src={fotoPromo}
                    alt={op?.referencia ?? ''}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', padding: 10, display: 'block', filter: 'drop-shadow(0 4px 12px rgba(0,52,180,0.2))' }}
                  />
                ) : fotoLado ? (
                  <img
                    src={fotoLado}
                    alt={op?.referencia ?? ''}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', padding: 10, display: 'block', filter: 'drop-shadow(0 4px 12px rgba(0,52,180,0.2))' }}
                  />
                ) : (
                  <span style={{ fontSize: 48, opacity: 0.2 }}>🏍️</span>
                )}
                {/* Badge "Foto del producto" */}
                <div style={{ position: 'absolute', top: 6, left: 6, background: '#0052B4', color: '#fff', fontSize: 7, fontWeight: 700, padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Tu moto
                </div>
              </div>

              {/* Número de cotización debajo de la foto */}
              <div style={{ width: '100%', background: '#0052B4', padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Cotización</div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 15, letterSpacing: 0.5 }}>MS-{pad(cotizacion.numero)}</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8, marginTop: 3 }}>{formatFecha(cotizacion.fecha_generacion)}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 7.5, marginTop: 1 }}>Válida {cotizacion.vigencia_dias} días</div>
              </div>
            </div>
          </div>

          {/* ══ CUERPO: 2 columnas ══════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '62% 38%', alignItems: 'start' }}>

            {/* ─── COLUMNA IZQUIERDA ──────────────────────────────────── */}
            <div style={{ padding: '18px 20px 16px', borderRight: '1px solid #e8edf5' }}>

              {/* DATOS DEL CLIENTE */}
              <div style={{ marginBottom: 18 }}>
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
                      <span style={{ fontSize: 8.5, color: '#64748b', minWidth: 58, flexShrink: 0 }}>{label}:</span>
                      <span style={{ flex: 1, borderBottom: '1px solid #b8c4d8', paddingBottom: 1, fontSize: 8.5, color: val ? '#1a1a2e' : 'transparent', fontWeight: val ? 600 : 400 }}>{val ?? ' '}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, padding: '6px 10px', borderLeft: '3px solid #0052B4', background: '#f0f5ff', borderRadius: '0 7px 7px 0' }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 10.5, color: '#0052B4', lineHeight: 1.5 }}>
                    <strong>Cuéntanos lo que necesitas</strong> y te ayudamos a encontrar la opción perfecta.
                  </div>
                </div>
              </div>

              {/* NOMBRE + CHIPS DE SPECS */}
              {op && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 900, fontSize: 19, color: '#001a5e', letterSpacing: -0.5, lineHeight: 1.1 }}>{op.referencia}</div>
                  {op.tagline_venta && <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', marginTop: 3 }}>{op.tagline_venta}</div>}
                  {specsChips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                      {specsChips.map(s => (
                        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 20, padding: '3px 10px', fontSize: 9.5, fontWeight: 700, color: '#1e40af' }}>
                          <span style={{ fontSize: 12 }}>{s.icon}</span> {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* FOTOS FRENTE + LADO */}
              {op && (fotoLado || fotoFrente) && (
                <div style={{ display: 'grid', gridTemplateColumns: fotoFrente && fotoFrente !== fotoLado ? '3fr 1.6fr' : '1fr', gap: 10, marginBottom: 14 }}>
                  {/* Foto lateral/principal */}
                  <div style={{ background: 'linear-gradient(135deg, #f0f5ff, #e8f0fe)', borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, position: 'relative' }}>
                    {fotoLado && <img src={fotoLado} alt={op.referencia} style={{ maxHeight: 135, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 6px 16px rgba(0,52,180,0.15))' }} />}
                    <div style={{ position: 'absolute', bottom: 6, left: 10, fontSize: 7.5, color: '#94a3b8', fontWeight: 600 }}>Vista lateral</div>
                  </div>
                  {/* Foto frente */}
                  {fotoFrente && fotoFrente !== fotoLado && (
                    <div style={{ background: '#f8faff', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', gap: 5 }}>
                      <img src={fotoFrente} alt="frente" style={{ maxHeight: 120, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0,52,180,0.12))' }} />
                      <div style={{ fontSize: 7.5, color: '#94a3b8', fontWeight: 600 }}>Vista frontal</div>
                    </div>
                  )}
                </div>
              )}

              {/* ESPECIFICACIONES TÉCNICAS */}
              {specsCheck.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingBottom: 5, borderBottom: '1.5px solid #dde3f0' }}>
                    Especificaciones técnicas
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                    {specsCheck.map(s => (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                        <Check />
                        <span style={{ fontSize: 9, color: '#334155' }}>{s}</span>
                      </div>
                    ))}
                  </div>
                  {op?.colores && (
                    <div style={{ marginTop: 8, fontSize: 9, color: '#64748b' }}>🎨 Colores disponibles: <strong style={{ color: '#334155' }}>{op.colores}</strong></div>
                  )}
                </div>
              )}

              {/* QUÉ INCLUYE */}
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 14, border: '1.5px solid #bbf7d0' }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Esta cotización incluye</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                  {['SOAT obligatorio', 'Matrícula + impuestos', 'Manual del propietario', 'Garantía de fábrica', '3 revisiones mano de obra gratis', 'Asesoría en trámites'].map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Check color="#16a34a" />
                      <span style={{ fontSize: 8.5, color: '#166534', fontWeight: 500 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* OBSERVACIONES */}
              {cotizacion.notas && (
                <div style={{ border: '1px dashed #94a3b8', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>📝 Observaciones</div>
                  <div style={{ fontSize: 9, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{cotizacion.notas}</div>
                </div>
              )}
            </div>

            {/* ─── COLUMNA DERECHA (SIDEBAR) ──────────────────────────── */}
            <div style={{ padding: '18px 14px', background: '#f8faff', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* PRECIO */}
              {(verContado || verPignorada) && (
                <div style={{ background: '#0052B4', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontWeight: 800, fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 6 }}>
                    Precio de tu moto
                  </div>
                  {verContado && (
                    <div style={{ marginBottom: verPignorada ? 10 : 0 }}>
                      <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Contado con papeles</div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: -0.5 }}>{cop(conPapeles)}</div>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>IVA incluido · SOAT · Matrícula</div>
                    </div>
                  )}
                  {verPignorada && (
                    <div style={{ borderTop: verContado ? '1px solid rgba(255,255,255,0.2)' : 'none', paddingTop: verContado ? 10 : 0 }}>
                      <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>En crédito (pignorada)</div>
                      <div style={{ fontSize: verContado ? 19 : 24, fontWeight: 900, color: '#90d4f7', lineHeight: 1 }}>{cop(pignorada)}</div>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Incluye prenda · Con papeles</div>
                    </div>
                  )}
                </div>
              )}

              {/* RAZONES PARA COMPRAR — copy persuasivo */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 12, padding: '13px 14px' }}>
                <div style={{ fontWeight: 800, fontSize: 9.5, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, borderBottom: '2px solid #0052B4', paddingBottom: 5 }}>
                  ¿Por qué es la decisión correcta?
                </div>
                {[
                  { icon: '🚀', bg: '#dbeafe', title: 'Movilidad sin límites',       desc: 'Llega a tiempo, evita trancones y recupera horas de tu día.' },
                  { icon: '💰', bg: '#fef9c3', title: 'Inversión inteligente',        desc: 'Ahorra hasta 4 veces más en combustible vs. un vehículo de 4 ruedas.' },
                  { icon: '🛡️', bg: '#dcfce7', title: 'Tranquilidad garantizada',    desc: `Garantía de fábrica${op?.garantia ? ` — ${op.garantia}` : ''}. Respaldo total.` },
                  { icon: '⚡', bg: '#fce7f3', title: 'Rendimiento comprobado',      desc: op?.rendimiento ? `${op.rendimiento} de rendimiento.` : 'Motor de alto desempeño y bajo consumo.' },
                  { icon: '🤝', bg: '#ede9fe', title: 'Servicio posventa',           desc: 'Siempre estaremos aquí. Taller propio, repuestos originales.' },
                ].map(({ icon, bg, title, desc }) => (
                  <div key={title} style={{ display: 'flex', gap: 9, marginBottom: 9, alignItems: 'flex-start' }}>
                    <div style={{ background: bg, borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 9, color: '#001a5e' }}>{title}</div>
                      <div style={{ fontSize: 8.5, color: '#475569', marginTop: 1.5, lineHeight: 1.4 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA: ¡APARTA HOY! */}
              <div style={{ background: 'linear-gradient(135deg, #001a5e, #0052B4)', borderRadius: 12, padding: '14px 14px', textAlign: 'center' }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: '#fff', marginBottom: 2 }}>¡APARTA HOY!</div>
                <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.7)', marginBottom: 12, lineHeight: 1.4 }}>
                  No pierdas esta oportunidad.<br/>Estamos listos para atenderte.
                </div>
                {tenant.whatsapp && (
                  <div style={{ background: '#25d366', borderRadius: 9, padding: '8px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <span style={{ fontSize: 18 }}>📱</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 }}>WhatsApp</div>
                      <div style={{ fontWeight: 800, fontSize: 11.5, color: '#fff' }}>{tenant.whatsapp}</div>
                    </div>
                  </div>
                )}
                {[
                  { icon: '☎️', val: tenant.telefono1 },
                  { icon: '✉️', val: tenant.email },
                ].filter(c => c.val).map(c => (
                  <div key={c.val} style={{ display: 'flex', gap: 7, marginBottom: 5, alignItems: 'center' }}>
                    <span style={{ fontSize: 12 }}>{c.icon}</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{c.val}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 10, paddingTop: 10, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'rgba(255,255,255,0.85)', fontSize: 11, lineHeight: 1.5 }}>
                  ¡Más que motos,<br/><strong>creamos experiencias!</strong>
                </div>
              </div>

              {/* Badges */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, textAlign: 'center' }}>
                  {[
                    { icon: '🛡️', t: 'GARANTÍA', s: '12 MESES*' },
                    { icon: '⭐', t: 'CALIDAD',   s: 'CERTIFICADA' },
                    { icon: '👍', t: 'CLIENTES',  s: 'SATISFECHOS' },
                  ].map(b => (
                    <div key={b.t}>
                      <div style={{ fontSize: 20, marginBottom: 3 }}>{b.icon}</div>
                      <div style={{ fontSize: 7.5, fontWeight: 800, color: '#0052B4', lineHeight: 1.2 }}>{b.t}</div>
                      <div style={{ fontSize: 7, color: '#64748b', fontWeight: 600 }}>{b.s}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Testimonial mini */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: 20, color: '#0052B4', fontFamily: 'Georgia, serif', lineHeight: 1, marginBottom: 5 }}>&ldquo;</div>
                <div style={{ fontSize: 8.5, color: '#334155', fontStyle: 'italic', lineHeight: 1.5 }}>
                  Excelente atención. Me asesoraron perfectamente y la entrega fue rápida y sin complicaciones.
                </div>
                <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#0052B4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>C</div>
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: '#1e293b' }}>Cliente satisfecho</div>
                    <div style={{ fontSize: 9, color: '#f59e0b' }}>⭐⭐⭐⭐⭐</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ══ FOOTER ══════════════════════════════════════════════════ */}
          <div style={{ background: 'linear-gradient(135deg, #001a5e 0%, #003087 50%, #0052B4 100%)', padding: '14px 28px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8, textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 2 }}>Tu próxima aventura</div>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, letterSpacing: -0.5, textTransform: 'uppercase', lineHeight: 1 }}>¡COMIENZA AQUÍ!</div>
              <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.5)', marginTop: 5 }}>
                Precios sujetos a cambio sin previo aviso · Vigencia: {cotizacion.vigencia_dias} días naturales
              </div>
            </div>
            <div style={{ textAlign: 'center', maxWidth: 170 }}>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                En {tenant.nombre || 'nuestro concesionario'} nos apasiona<br/>acompañarte en cada kilómetro.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {tenant.logo_uri && (
                <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 30, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
