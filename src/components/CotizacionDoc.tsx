'use client'
import { useEffect } from 'react'
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
  instagram?: string; facebook?: string; tiktok?: string
  incluye?: string
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

const DEFAULT_INCLUYE = [
  'SOAT obligatorio',
  'Matrícula + impuestos',
  'Manual del propietario',
  'Garantía de fábrica',
  '3 revisiones mano de obra gratis',
]

const DEFAULT_BENEFICIOS = [
  { icon: '🚀', bg: '#dbeafe', title: 'Movilidad sin límites',    desc: 'Llega a tiempo, evita trancones y recupera horas de tu día.' },
  { icon: '💰', bg: '#fef9c3', title: 'Inversión inteligente',     desc: 'Ahorra hasta 4 veces más en combustible vs. un vehículo de 4 ruedas.' },
  { icon: '🛡️', bg: '#dcfce7', title: 'Tranquilidad garantizada',  desc: 'Garantía de fábrica. Respaldo total.' },
  { icon: '⚡', bg: '#fce7f3', title: 'Rendimiento comprobado',   desc: 'Motor de alto desempeño y bajo consumo.' },
  { icon: '🤝', bg: '#ede9fe', title: 'Servicio posventa',         desc: 'Siempre estaremos aquí. Taller propio, repuestos originales.' },
]
const BG_CYCLE = ['#dbeafe', '#fef9c3', '#dcfce7', '#fce7f3', '#ede9fe']

export default function CotizacionDoc({ cotizacion, tenant }: Props) {
  const whatsappNum  = tenant.whatsapp?.replace(/\D/g, '') ?? ''
  const whatsappLink = whatsappNum ? `https://wa.me/${whatsappNum}` : '#'
  const op           = cotizacion.opciones[0]

  const fotoPromo  = op?.foto_promo_uri  || ''
  const fotoFrente = op?.foto_frente_uri || ''
  const fotoLado   = op?.foto_lado_uri   || ''
  const fotoExtra  = op?.foto_extra_uri  || ''

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

  const specsChips = op ? [
    op.cilindraje    && { icon: '⚙️', label: op.cilindraje },
    op.frenos        && { icon: '🛡️', label: op.frenos },
    op.garantia      && { icon: '✅', label: op.garantia },
    op.caracteristica && { icon: '✨', label: op.caracteristica },
  ].filter(Boolean).slice(0, 4) as { icon: string; label: string }[] : []

  // Parse "incluye" items — tenant override or defaults
  const incluyeItems: string[] = (() => {
    if (tenant.incluye?.trim()) {
      return tenant.incluye.split('\n').map(l => l.trim()).filter(Boolean)
    }
    return DEFAULT_INCLUYE
  })()

  // Parse "beneficios" bullets — per-moto override or defaults
  const beneficios: { icon: string; bg: string; title: string; desc: string }[] = (() => {
    if (op?.cotizacion_beneficios?.trim()) {
      return op.cotizacion_beneficios.split('\n').map((line, i) => {
        const [head = '', desc = ''] = line.split('|')
        const trimHead = head.trim()
        // Extract leading emoji (could be multi-char)
        const emojiMatch = trimHead.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\S{1,2})\s/u)
        const icon  = emojiMatch ? emojiMatch[1] : '•'
        const title = emojiMatch ? trimHead.slice(emojiMatch[0].length) : trimHead
        return { icon, bg: BG_CYCLE[i % BG_CYCLE.length], title, desc: desc.trim() }
      }).filter(b => b.title)
    }
    return DEFAULT_BENEFICIOS.map((b, i) => ({
      ...b,
      desc: b.title === 'Tranquilidad garantizada' && op?.garantia ? `Garantía de fábrica — ${op.garantia}. Respaldo total.`
          : b.title === 'Rendimiento comprobado'   && op?.rendimiento ? `${op.rendimiento} de rendimiento.`
          : b.desc,
      bg: BG_CYCLE[i % BG_CYCLE.length],
    }))
  })()

  // Fotos del cuerpo del documento
  const fotosBody = [
    fotoPromo  && { src: fotoPromo,  label: 'Foto promocional' },
    fotoFrente && { src: fotoFrente, label: 'Vista frontal' },
    fotoLado   && { src: fotoLado,   label: 'Vista lateral' },
    fotoExtra  && { src: fotoExtra,  label: 'Vista adicional' },
  ].filter(Boolean) as { src: string; label: string }[]

  useEffect(() => {
    const prev = document.title
    document.title = `Cotización MS-${pad(cotizacion.numero)}`
    return () => { document.title = prev }
  }, [cotizacion.numero])

  return (
    <>
      <style>{`
        @page { margin: 0; size: A4 portrait; }
        @media print {
          body { margin: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .cot-scale {
            transform: scale(0.85);
            transform-origin: top left;
            width: 117.65%;
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

            {/* Izquierda: Logo grande + número cotización + contactos */}
            <div style={{ background: 'linear-gradient(135deg, #001a5e 0%, #0035a0 55%, #0052B4 100%)', padding: '18px 24px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
              {tenant.logo_uri
                ? <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 72, objectFit: 'contain', objectPosition: 'left', filter: 'brightness(0) invert(1)', display: 'block' }} />
                : <div style={{ color: '#fff', fontSize: 28, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.5 }}>{tenant.nombre}</div>
              }
              {tenant.tagline && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8, letterSpacing: 2.5, textTransform: 'uppercase', marginTop: -4 }}>{tenant.tagline}</div>}

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
                <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 14px', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>Cotización</div>
                  <div style={{ color: '#fff', fontWeight: 900, fontSize: 18, letterSpacing: 0.5 }}>MS-{pad(cotizacion.numero)}</div>
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, marginBottom: 2 }}>📅 {formatFecha(cotizacion.fecha_generacion)}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8.5 }}>⏰ Válida {cotizacion.vigencia_dias} días</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                {[
                  { icon: '📍', text: tenant.direccion },
                  { icon: '📞', text: [tenant.telefono1, tenant.telefono2].filter(Boolean).join(' · ') },
                  { icon: '✉️', text: tenant.email },
                  { icon: '🌐', text: tenant.web },
                ].filter(c => c.text).map(c => (
                  <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 10 }}>{c.icon}</span>
                    <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.75)' }}>{c.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Derecha: FOTO PROMOCIONAL — grande, sin marco, bordes difuminados */}
            <div style={{ display: 'flex', flexDirection: 'column', background: '#f0f5ff', minWidth: 160, maxWidth: 165, overflow: 'hidden' }}>
              <div style={{ width: '100%', flex: 1, background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                {(fotoPromo || fotoLado || fotoFrente) ? (
                  <img
                    src={fotoPromo || fotoLado || fotoFrente}
                    alt={op?.referencia ?? ''}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      objectPosition: 'center',
                      padding: 6,
                      display: 'block',
                      filter: 'drop-shadow(0 4px 18px rgba(0,52,180,0.18))',
                      maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 45%, transparent 100%)',
                      WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 45%, transparent 100%)',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 52, opacity: 0.2 }}>🏍️</span>
                )}
              </div>
              <div style={{ background: '#0052B4', padding: '5px 10px', textAlign: 'center' }}>
                <div style={{ color: '#fff', fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tu moto</div>
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

              {/* FOTOS DEL PRODUCTO (hasta 4) */}
              {op && fotosBody.length > 0 && (() => {
                if (fotosBody.length === 1) return (
                  <div style={{ background: 'linear-gradient(135deg, #f0f5ff, #e8f0fe)', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140, marginBottom: 14, position: 'relative' }}>
                    <img src={fotosBody[0].src} alt={op.referencia} style={{ maxHeight: 130, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 6px 16px rgba(0,52,180,0.15))' }} />
                    <div style={{ position: 'absolute', bottom: 6, left: 10, fontSize: 7.5, color: '#94a3b8', fontWeight: 600 }}>{fotosBody[0].label}</div>
                  </div>
                )

                const [principal, ...secundarias] = fotosBody
                const secHeight = secundarias.length >= 3 ? 54 : secundarias.length === 2 ? 72 : 110

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 14 }}>
                    <div style={{ background: 'linear-gradient(135deg, #f0f5ff, #e8f0fe)', borderRadius: 12, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 150, position: 'relative' }}>
                      <img src={principal.src} alt={op.referencia} style={{ maxHeight: 140, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 6px 16px rgba(0,52,180,0.15))' }} />
                      <div style={{ position: 'absolute', bottom: 6, left: 10, fontSize: 7.5, color: '#94a3b8', fontWeight: 600 }}>{principal.label}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {secundarias.map(f => (
                        <div key={f.label} style={{ background: '#f8faff', borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', flex: 1, gap: 3 }}>
                          <img src={f.src} alt={f.label} style={{ maxHeight: secHeight, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 3px 6px rgba(0,52,180,0.1))' }} />
                          <div style={{ fontSize: 7, color: '#94a3b8', fontWeight: 600 }}>{f.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* COLORES DISPONIBLES — debajo de las fotos */}
              {op?.colores && (
                <div style={{ marginBottom: 14, background: '#fdf4ff', borderRadius: 10, padding: '9px 12px', border: '1.5px solid #e9d5ff' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>🎨 Colores disponibles</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {op.colores.split(/[,;\/]/).map(c => c.trim()).filter(Boolean).map(color => (
                      <span key={color} style={{ background: '#ede9fe', border: '1.5px solid #c4b5fd', borderRadius: 20, padding: '3px 10px', fontSize: 9, fontWeight: 700, color: '#5b21b6' }}>
                        {color}
                      </span>
                    ))}
                  </div>
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
                </div>
              )}

              {/* QUÉ INCLUYE */}
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', marginBottom: 14, border: '1.5px solid #bbf7d0' }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Esta cotización incluye</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                  {incluyeItems.map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Check color="#16a34a" />
                      <span style={{ fontSize: 8.5, color: '#166534', fontWeight: 500 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CONTACTO DIRECTO — siempre visible */}
              <div style={{ background: '#001a5e', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Contacto directo</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                  {tenant.whatsapp ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ background: '#25d366', borderRadius: 5, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>📱</div>
                      <div>
                        <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>WhatsApp</div>
                        <div style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>+{tenant.whatsapp}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 5, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0 }}>📱</div>
                      <div>
                        <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>WhatsApp</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>—</div>
                      </div>
                    </div>
                  )}
                  {tenant.telefono1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>☎️</span>
                      <div>
                        <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Teléfono</div>
                        <div style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>{tenant.telefono1}</div>
                      </div>
                    </div>
                  ) : null}
                  {tenant.telefono2 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>📞</span>
                      <div>
                        <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Teléfono 2</div>
                        <div style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>{tenant.telefono2}</div>
                      </div>
                    </div>
                  ) : null}
                  {tenant.email ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>✉️</span>
                      <div>
                        <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Email</div>
                        <div style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>{tenant.email}</div>
                      </div>
                    </div>
                  ) : null}
                  {tenant.direccion ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, gridColumn: 'span 2' }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>📍</span>
                      <div>
                        <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Dirección</div>
                        <div style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>{tenant.direccion}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
                {/* Redes sociales */}
                {(tenant.instagram || tenant.facebook || tenant.tiktok) && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 10, paddingTop: 8, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>Síguenos:</div>
                    {tenant.instagram && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13 }}>📸</span>
                        <span style={{ fontSize: 9, color: '#e879f9', fontWeight: 700 }}>{tenant.instagram}</span>
                      </div>
                    )}
                    {tenant.facebook && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13 }}>👥</span>
                        <span style={{ fontSize: 9, color: '#60a5fa', fontWeight: 700 }}>{tenant.facebook}</span>
                      </div>
                    )}
                    {tenant.tiktok && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 13 }}>🎵</span>
                        <span style={{ fontSize: 9, color: '#f0abfc', fontWeight: 700 }}>{tenant.tiktok}</span>
                      </div>
                    )}
                  </div>
                )}
                {!tenant.instagram && !tenant.facebook && !tenant.tiktok && !tenant.whatsapp && !tenant.telefono1 && !tenant.email && !tenant.direccion && (
                  <div style={{ marginTop: 6, fontSize: 8, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                    Completa tus datos en Config. Ventas para que aparezcan aquí.
                  </div>
                )}
              </div>

              {/* OBSERVACIONES */}
              <div style={{ background: '#fffbeb', borderRadius: 10, padding: '10px 14px', border: '1.5px solid #fde68a' }}>
                <div style={{ fontSize: 8.5, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>📝 Notas adicionales</div>
                {cotizacion.notas ? (
                  <div style={{ fontSize: 9, color: '#78350f', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{cotizacion.notas}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {['', '', ''].map((_, i) => (
                      <div key={i} style={{ borderBottom: '1px solid #fcd34d', height: 16 }} />
                    ))}
                  </div>
                )}
              </div>
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

              {/* RAZONES PARA COMPRAR */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 12, padding: '13px 14px' }}>
                <div style={{ fontWeight: 800, fontSize: 9.5, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, borderBottom: '2px solid #0052B4', paddingBottom: 5 }}>
                  ¿Por qué es la decisión correcta?
                </div>
                {beneficios.map(({ icon, bg, title, desc }) => (
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
