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

function IconCheck({ color = '#0052B4' }: { color?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="12" fill={color} />
      <path d="M7 12.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* Foto difuminada como fondo — usamos <img> (no background-image CSS)
   para compatibilidad con impresión/PDF en todos los navegadores */
function BlurredBg({ src, opacity = 0.22 }: { src: string; opacity?: number }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: -20,
        width: 'calc(100% + 40px)',
        height: 'calc(100% + 40px)',
        objectFit: 'cover',
        objectPosition: 'center',
        filter: 'blur(14px) saturate(0.8)',
        opacity,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}

export default function CotizacionDoc({ cotizacion, tenant }: Props) {
  const whatsappNum  = tenant.whatsapp?.replace(/\D/g, '') ?? ''
  const whatsappLink = whatsappNum ? `https://wa.me/${whatsappNum}` : '#'

  const op          = cotizacion.opciones[0]
  const fotoPromo   = op?.foto_promo_uri   || ''
  const fotoLado    = op?.foto_lado_uri    || op?.foto_promo_uri || op?.foto_frente_uri || ''
  const fotoFrente  = op?.foto_frente_uri  || ''
  // Fondo difuminado: promo si existe, si no la lateral
  const fotoBg      = fotoPromo || fotoLado

  // Cálculos de precio
  const precioBase  = op?.precio ?? 0
  const papeles     = op?.costo_documentos ?? 0
  const conPapeles  = precioBase + papeles
  const iva         = Math.round(precioBase * 0.19)
  const totalConIva = conPapeles + iva
  const mostrar     = op?.mostrar_precio ?? false

  function precioO(n: number) { return mostrar ? cop(n) : null }

  const specsLista = op ? [
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
    { icon: '🛡️', title: 'Garantía real',             desc: 'Respaldo total en todas nuestras unidades.' },
    { icon: '🔧', title: 'Servicio especializado',     desc: 'Taller certificado, refacciones originales.' },
    { icon: '🚚', title: 'Entrega a convenir',         desc: 'Llevamos tu unidad hasta donde la necesites.' },
    { icon: '💳', title: 'Facilidades de pago',        desc: 'Financiamiento con las mejores entidades.' },
    { icon: '🎓', title: 'Asesoría personalizada',     desc: 'Te acompañamos en todo el proceso.' },
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
        <div style={{ width: '210mm', background: '#fff', boxShadow: '0 8px 60px rgba(0,0,0,0.2)', fontFamily: "'Segoe UI', Arial, sans-serif" }}>

          {/* ══ ENCABEZADO con foto difuminada de fondo ══ */}
          <div style={{ position: 'relative', overflow: 'hidden', background: '#0035a0' }}>
            <BlurredBg src={fotoBg} opacity={0.28} />
            {/* Capa de color encima del blur */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,26,94,0.90) 0%, rgba(0,52,160,0.80) 50%, rgba(0,82,204,0.75) 100%)', zIndex: 1 }} />

            {/* Contenido del header */}
            <div style={{ position: 'relative', zIndex: 2, padding: '24px 28px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                {tenant.logo_uri
                  ? <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 58, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 12, display: 'block' }} />
                  : <div style={{ color: '#fff', fontSize: 24, fontWeight: 900, textTransform: 'uppercase', marginBottom: 12 }}>{tenant.nombre}</div>
                }
                <div style={{ color: '#fff', fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 0.9, textTransform: 'uppercase', textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}>
                  COTIZACIÓN
                </div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 8, fontStyle: 'italic' }}>
                  Tu próxima <strong style={{ color: '#90d4f7', fontStyle: 'normal' }}>aventura</strong> comienza aquí
                </div>
                {tenant.tagline && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, letterSpacing: 2.5, textTransform: 'uppercase', marginTop: 5 }}>{tenant.tagline}</div>}
              </div>

              {/* Tarjeta número */}
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '14px 18px', minWidth: 168, border: '1px solid rgba(255,255,255,0.25)', flexShrink: 0 }}>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 20, letterSpacing: -0.5, marginBottom: 10 }}>COT.</div>
                <div style={{ background: '#1a56db', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 15, fontWeight: 900, display: 'inline-block', marginBottom: 10, letterSpacing: 0.5 }}>
                  MS-{pad(cotizacion.numero)}
                </div>
                {[
                  ['📅', 'Fecha', formatFecha(cotizacion.fecha_generacion)],
                  ['⏰', 'Vigencia', `${cotizacion.vigencia_dias} días`],
                ].map(([icon, label, val]) => (
                  <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
                    <span style={{ fontSize: 13 }}>{icon}</span>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                      <div style={{ color: '#fff', fontSize: 10, fontWeight: 600 }}>{val}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Barra contacto */}
          <div style={{ background: '#001a5e', display: 'flex', flexWrap: 'wrap', borderBottom: '3px solid #0052B4' }}>
            {[
              { icon: '📍', text: tenant.direccion },
              { icon: '📞', text: [tenant.telefono1, tenant.telefono2].filter(Boolean).join(' / ') },
              { icon: '✉️', text: tenant.email },
              { icon: '🌐', text: tenant.web },
            ].filter(c => c.text).map(c => (
              <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRight: '1px solid rgba(255,255,255,0.1)', flex: '1 1 auto' }}>
                <span style={{ fontSize: 11, flexShrink: 0 }}>{c.icon}</span>
                <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.3 }}>{c.text}</span>
              </div>
            ))}
          </div>

          {/* ══ CUERPO: 2 columnas ══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '62% 38%', alignItems: 'start' }}>

            {/* ─── COLUMNA IZQUIERDA ─── */}
            <div style={{ padding: '18px 20px 16px', borderRight: '1px solid #e8edf5' }}>

              {/* DATOS DEL CLIENTE */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <svg width="15" height="15" fill="#0052B4" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1 }}>Datos del cliente</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 14px' }}>
                  {[
                    ['Empresa / Nombre', cotizacion.cliente_nombre],
                    ['Contacto', ''],
                    ['Teléfono', cotizacion.cliente_celular],
                    ['Correo', cotizacion.cliente_email],
                    ['Dirección', ''],
                    ['Ciudad / Estado', ''],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', gap: 6, marginBottom: 7, alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 9, color: '#555', minWidth: 60, flexShrink: 0 }}>{label}:</span>
                      <span style={{ flex: 1, borderBottom: '1px solid #b8c4d8', paddingBottom: 1, fontSize: 9, color: val ? '#1a1a2e' : 'transparent', fontWeight: val ? 600 : 400 }}>{val ?? ' '}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, padding: '7px 12px', borderLeft: '3px solid #0052B4', background: '#f0f5ff', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 11, color: '#0052B4', lineHeight: 1.5 }}>
                    Cuéntanos lo que necesitas <strong>y te ayudamos a elegir la mejor opción.</strong>
                  </div>
                </div>
              </div>

              {/* LA MOTO */}
              {op && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <span style={{ fontSize: 15 }}>🏍️</span>
                    <span style={{ fontSize: 9.5, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1 }}>Tu moto seleccionada</span>
                  </div>

                  {/* Nombre de la moto */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 18, color: '#001a5e', lineHeight: 1.1 }}>{op.referencia}</div>
                    {op.tagline_venta && <div style={{ fontSize: 9.5, color: '#64748b', fontStyle: 'italic', marginTop: 3 }}>{op.tagline_venta}</div>}
                  </div>

                  {/* Fotos: lado (grande) + frente (pequeña) */}
                  <div style={{ display: 'grid', gridTemplateColumns: fotoFrente && fotoFrente !== fotoLado ? '3fr 1.4fr' : '1fr', gap: 8, marginBottom: 14 }}>
                    {/* Foto lateral — principal */}
                    <div style={{ background: '#f0f5ff', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 150, position: 'relative', overflow: 'hidden' }}>
                      {/* Blur sutil de la foto de fondo (ambientación) */}
                      {fotoLado && <BlurredBg src={fotoLado} opacity={0.08} />}
                      {fotoLado
                        ? <img src={fotoLado} alt={op.referencia} style={{ maxHeight: 140, maxWidth: '100%', objectFit: 'contain', position: 'relative', zIndex: 1 }} />
                        : <span style={{ fontSize: 50 }}>🏍️</span>
                      }
                      <div style={{ position: 'absolute', bottom: 6, left: 8, fontSize: 8, color: '#94a3b8', fontWeight: 600, zIndex: 2 }}>Vista lateral</div>
                    </div>

                    {/* Foto de frente */}
                    {fotoFrente && fotoFrente !== fotoLado && (
                      <div style={{ background: '#f8faff', borderRadius: 12, padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1px solid #e2e8f0' }}>
                        <img src={fotoFrente} alt={`${op.referencia} frente`} style={{ maxHeight: 130, maxWidth: '100%', objectFit: 'contain' }} />
                        <div style={{ fontSize: 8, color: '#94a3b8', fontWeight: 600 }}>Vista frontal</div>
                      </div>
                    )}
                  </div>

                  {/* Specs + Precio en 2 columnas */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                    {/* Especificaciones */}
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingBottom: 4, borderBottom: '1.5px solid #dde3f0' }}>Especificaciones</div>
                      {specsLista.map(s => (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <IconCheck />
                          <span style={{ fontSize: 9.5, color: '#334155' }}>{s}</span>
                        </div>
                      ))}
                      {op.colores && (
                        <div style={{ marginTop: 8, fontSize: 9, color: '#64748b' }}>🎨 Colores: <strong>{op.colores}</strong></div>
                      )}
                    </div>

                    {/* Desglose de precio */}
                    <div style={{ background: '#f0f5ff', borderRadius: 10, padding: 12, border: '1.5px solid #c7d9f8' }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, paddingBottom: 4, borderBottom: '1.5px solid #c7d9f8' }}>
                        Desglose de precio
                      </div>
                      {[
                        { label: 'Sin papeles',            val: precioBase,  highlight: false, main: false },
                        { label: 'Documentos (SOAT+mat.)', val: papeles,     highlight: false, main: false },
                        { label: 'Con papeles',            val: conPapeles,  highlight: true,  main: false },
                        { label: `IVA (19%)`,              val: iva,         highlight: false, main: false },
                        { label: 'TOTAL CON IVA',          val: totalConIva, highlight: false, main: true  },
                      ].map(({ label, val, highlight, main }) => (
                        <div key={label} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: main ? '7px 8px' : '4px 4px',
                          marginBottom: main ? 0 : 3,
                          background: main ? '#0052B4' : highlight ? 'rgba(0,82,180,0.08)' : 'transparent',
                          borderRadius: main || highlight ? 6 : 0,
                          borderBottom: !main && !highlight ? '1px dashed #c7d9f8' : 'none',
                        }}>
                          <span style={{ fontSize: main ? 9.5 : 9, fontWeight: main ? 800 : highlight ? 700 : 500, color: main ? '#fff' : highlight ? '#0035a0' : '#475569', textTransform: main ? 'uppercase' as const : 'none' as const }}>
                            {label}
                          </span>
                          {mostrar ? (
                            <span style={{ fontSize: main ? 11 : 9.5, fontWeight: main ? 900 : highlight ? 800 : 600, color: main ? '#fff' : highlight ? '#001a5e' : '#334155' }}>
                              {cop(val)}
                            </span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 700, color: main ? '#fff' : '#334155' }}>$</span>
                              <div style={{ width: 52, borderBottom: `1.5px solid ${main ? 'rgba(255,255,255,0.5)' : '#8ba4cc'}`, height: 14 }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Observaciones */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Observaciones</div>
                    <div style={{ border: '1px solid #dde3f0', borderRadius: 8, padding: '8px 12px', minHeight: 52, fontSize: 9.5, color: '#334155', background: '#fafbfc', lineHeight: 1.5 }}>
                      {cotizacion.notas || ''}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ─── COLUMNA DERECHA (SIDEBAR) ─── */}
            <div style={{ padding: '18px 14px', background: '#f8faff', display: 'flex', flexDirection: 'column', gap: 12, minHeight: '100%' }}>

              {/* Por qué elegirnos */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 12, padding: '14px 14px', flex: 'none' }}>
                <div style={{ fontWeight: 800, fontSize: 10, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, borderBottom: '2px solid #0052B4', paddingBottom: 5 }}>
                  ¿Por qué elegirnos?
                </div>
                {razones.map(({ icon, title, desc }) => (
                  <div key={title} style={{ display: 'flex', gap: 9, marginBottom: 9, alignItems: 'flex-start' }}>
                    <div style={{ background: '#eff6ff', borderRadius: 7, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, border: '1px solid #bfdbfe' }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 9, color: '#001a5e', textTransform: 'uppercase', letterSpacing: 0.3 }}>{title}</div>
                      <div style={{ fontSize: 8.5, color: '#475569', marginTop: 1.5, lineHeight: 1.4 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA ¿Listo para continuar? */}
              <div style={{ background: '#0052B4', borderRadius: 12, padding: '14px 14px', flex: 'none' }}>
                <div style={{ fontWeight: 900, fontSize: 11.5, color: '#fff', marginBottom: 3 }}>¿LISTO PARA CONTINUAR?</div>
                <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.7)', marginBottom: 12 }}>Estamos listos para ayudarte.</div>
                {[
                  { icon: '📱', label: 'WhatsApp',   val: tenant.whatsapp  },
                  { icon: '☎️', label: 'Llámanos',   val: tenant.telefono1 },
                  { icon: '✉️', label: 'Escríbenos', val: tenant.email    },
                  { icon: '📍', label: 'Visítanos',  val: tenant.direccion },
                ].filter(c => c.val).map(c => (
                  <div key={c.label} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{c.icon}</span>
                    <div>
                      <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</div>
                      <div style={{ fontSize: 9, color: '#fff', fontWeight: 700, lineHeight: 1.4 }}>{c.val}</div>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 10, paddingTop: 10, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 1.5, textAlign: 'center' }}>
                  ¡Más que motos,<br /><strong>creamos experiencias!</strong>
                </div>
              </div>

              {/* Badges */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, textAlign: 'center' }}>
                  {[
                    { icon: '🛡️', title: 'GARANTÍA', sub: '12 MESES' },
                    { icon: '⭐', title: 'CALIDAD', sub: 'GARANTIZADA' },
                    { icon: '👍', title: 'CLIENTES', sub: 'SATISFECHOS' },
                  ].map(b => (
                    <div key={b.title}>
                      <div style={{ fontSize: 20, marginBottom: 3 }}>{b.icon}</div>
                      <div style={{ fontSize: 7.5, fontWeight: 800, color: '#0052B4', lineHeight: 1.2 }}>{b.title}</div>
                      <div style={{ fontSize: 7, color: '#64748b', fontWeight: 600 }}>{b.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ══ FOOTER con foto difuminada de fondo ══ */}
          <div style={{ position: 'relative', overflow: 'hidden', background: '#001a5e' }}>
            <BlurredBg src={fotoBg} opacity={0.2} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,26,94,0.92) 0%, rgba(0,52,160,0.85) 60%, rgba(0,82,204,0.80) 100%)', zIndex: 1 }} />
            <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '16px 28px', gap: 20 }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 2 }}>Tu próxima aventura</div>
                <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, letterSpacing: -0.5, textTransform: 'uppercase', lineHeight: 1 }}>¡COMIENZA AQUÍ!</div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12 }}>⏰</span>
                  <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Cotización válida por {cotizacion.vigencia_dias} días naturales</span>
                </div>
              </div>
              <div style={{ textAlign: 'center', maxWidth: 180 }}>
                <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                  En {tenant.nombre || 'nuestro concesionario'} nos apasiona lo que hacemos<br />
                  y estamos listos para acompañarte en cada kilómetro.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                {tenant.logo_uri && (
                  <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 34, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
