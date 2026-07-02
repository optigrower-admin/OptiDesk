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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
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
  { icon: '🚀', bg: '#dbeafe', title: 'Movilidad sin límites',   desc: 'Llega a tiempo, evita trancones y recupera horas de tu día.' },
  { icon: '💰', bg: '#fef9c3', title: 'Inversión inteligente',    desc: 'Ahorra hasta 4 veces más en combustible vs. un vehículo de 4 ruedas.' },
  { icon: '🛡️', bg: '#dcfce7', title: 'Tranquilidad garantizada', desc: 'Garantía de fábrica. Respaldo total.' },
  { icon: '⚡', bg: '#fce7f3', title: 'Rendimiento comprobado',  desc: 'Motor de alto desempeño y bajo consumo.' },
  { icon: '🤝', bg: '#ede9fe', title: 'Servicio posventa',        desc: 'Siempre estaremos aquí. Taller propio, repuestos originales.' },
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

  /* Foto del header: promo > extra > frente > lado */
  const fotoHeader = fotoPromo || fotoExtra || fotoFrente || fotoLado

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

  const incluyeItems: string[] = tenant.incluye?.trim()
    ? tenant.incluye.split('\n').map(l => l.trim()).filter(Boolean)
    : DEFAULT_INCLUYE

  const beneficios: { icon: string; bg: string; title: string; desc: string }[] = (() => {
    if (op?.cotizacion_beneficios?.trim()) {
      return op.cotizacion_beneficios.split('\n').map((line, i) => {
        const [head = '', desc = ''] = line.split('|')
        const trimHead = head.trim()
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

  /* Fotos del cuerpo: extra (principal, sin título), frente + lado (con título) */
  let fotoPrincipal: { src: string } | null = null
  const fotosSecundarias: { src: string; label: string }[] = []
  if (fotoExtra) {
    fotoPrincipal = { src: fotoExtra }
    if (fotoFrente) fotosSecundarias.push({ src: fotoFrente, label: 'Vista frontal' })
    if (fotoLado)   fotosSecundarias.push({ src: fotoLado,   label: 'Vista lateral' })
  } else if (fotoFrente) {
    fotoPrincipal = { src: fotoFrente }
    if (fotoLado) fotosSecundarias.push({ src: fotoLado, label: 'Vista lateral' })
  } else if (fotoLado) {
    fotoPrincipal = { src: fotoLado }
  }

  useEffect(() => {
    const prev = document.title
    document.title = `Cotización MS-${pad(cotizacion.numero)}`
    return () => { document.title = prev }
  }, [cotizacion.numero])

  return (
    <>
      <style>{`
        /* ── Tamaño de página: carta ── */
        @page { margin: 0; size: 8.5in 11in portrait; }

        /* ── Pantalla: el doc mide 215mm de ancho ── */
        .cot-doc { width: 215mm; }

        /* ── Impresión: zoom 0.75 para que quepa en carta ──
           zoom ajusta paginación correctamente (Chrome/Edge).
           215mm / 0.75 = 286.7mm → visual 215mm = ancho carta. */
        @media print {
          body  { margin: 0 !important; background: white !important; }
          .no-print  { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .cot-doc {
            zoom: 0.75;
            width: 286mm; /* 215/0.75 → tras zoom visual = 215mm */
            box-shadow: none !important;
          }
        }

        body { margin: 0; background: #e5e7eb; }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── TOOLBAR (no imprime) ── */}
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

      {/* ── DOCUMENTO ── */}
      <div className="no-print:mt-16 min-h-screen flex justify-center py-8 px-4 print:p-0 print:mt-0" style={{ background: '#e5e7eb' }}>
        <div className="cot-doc" style={{ background: '#fff', boxShadow: '0 8px 60px rgba(0,0,0,0.2)', fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 10 }}>

          {/* ══ HEADER ══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px', alignItems: 'stretch', borderBottom: '3px solid #0052B4', overflow: 'hidden' }}>

            {/* Izquierda: gradiente azul */}
            <div style={{ background: 'linear-gradient(135deg, #001a5e 0%, #0035a0 55%, #0052B4 100%)', padding: '14px 20px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
              {/* Logo cargado desde Config Ventas (tenants.logo_url) */}
              {tenant.logo_uri
                ? <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 60, objectFit: 'contain', objectPosition: 'left', filter: 'brightness(0) invert(1)', display: 'block' }} />
                : <div style={{ color: '#fff', fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.5 }}>{tenant.nombre}</div>
              }
              {tenant.tagline && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 7.5, letterSpacing: 2, textTransform: 'uppercase', marginTop: -3 }}>{tenant.tagline}</div>}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 7, padding: '6px 12px', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 7, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>Cotización</div>
                  <div style={{ color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>MS-{pad(cotizacion.numero)}</div>
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8.5, marginBottom: 1 }}>📅 {formatFecha(cotizacion.fecha_generacion)}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 8 }}>⏰ Válida {cotizacion.vigencia_dias} días</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                {[
                  { icon: '📍', text: tenant.direccion },
                  { icon: '📞', text: [tenant.telefono1, tenant.telefono2].filter(Boolean).join(' · ') },
                  { icon: '✉️', text: tenant.email },
                  { icon: '🌐', text: tenant.web },
                ].filter(c => c.text).map(c => (
                  <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9 }}>{c.icon}</span>
                    <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.75)' }}>{c.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Derecha: foto promocional sin marco, difuminada desde la izquierda
                Se usa un overlay sobre la imagen (más compatible que mask-image). */}
            <div style={{ position: 'relative', overflow: 'hidden', background: '#0035a0' }}>
              {fotoHeader ? (
                <>
                  <img
                    src={fotoHeader}
                    alt={op?.referencia ?? ''}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center right', display: 'block' }}
                  />
                  {/* Overlay gradiente: azul opaco izquierda → transparente derecha */}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #001a5e 0%, #001a5e 12%, rgba(0,26,94,0.82) 28%, rgba(0,45,130,0.45) 52%, rgba(0,52,180,0.1) 75%, transparent 100%)' }} />
                </>
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: 0.15 }}>🏍️</div>
              )}
            </div>
          </div>

          {/* ══ CUERPO: 2 columnas ══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', alignItems: 'start' }}>

            {/* ─── COLUMNA IZQUIERDA ─── */}
            <div style={{ padding: '13px 16px 12px', borderRight: '1px solid #e8edf5' }}>

              {/* DATOS DEL CLIENTE — solo 3 campos */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <svg width="12" height="12" fill="#0052B4" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  <span style={{ fontSize: 8, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1 }}>Datos del cliente</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[
                    ['Empresa / Nombre', cotizacion.cliente_nombre],
                    ['Teléfono',         cotizacion.cliente_celular],
                    ['Correo electrónico', cotizacion.cliente_email],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 8, color: '#64748b', minWidth: 70, flexShrink: 0 }}>{label}:</span>
                      <span style={{ flex: 1, borderBottom: '1px solid #b8c4d8', paddingBottom: 1, fontSize: 8, color: val ? '#1a1a2e' : 'transparent', fontWeight: val ? 600 : 400 }}>{val ?? ' '}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 7, padding: '5px 9px', borderLeft: '3px solid #0052B4', background: '#f0f5ff', borderRadius: '0 6px 6px 0' }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 9.5, color: '#0052B4', lineHeight: 1.4 }}>
                    <strong>Cuéntanos lo que necesitas</strong> y te ayudamos a encontrar la opción perfecta.
                  </div>
                </div>
              </div>

              {/* NOMBRE + CHIPS */}
              {op && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: '#001a5e', letterSpacing: -0.5, lineHeight: 1.1 }}>{op.referencia}</div>
                  {op.tagline_venta && <div style={{ fontSize: 9, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>{op.tagline_venta}</div>}
                  {specsChips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {specsChips.map(s => (
                        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 20, padding: '2px 8px', fontSize: 8.5, fontWeight: 700, color: '#1e40af' }}>
                          <span style={{ fontSize: 10 }}>{s.icon}</span> {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* FOTOS: extra (principal sin título) + frente/lado (con título) */}
              {op && fotoPrincipal && (
                <div style={{ display: 'grid', gridTemplateColumns: fotosSecundarias.length > 0 ? '2fr 1fr' : '1fr', gap: 6, marginBottom: 10 }}>
                  <div style={{ background: 'linear-gradient(135deg, #f0f5ff, #e8f0fe)', borderRadius: 10, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
                    <img src={fotoPrincipal.src} alt={op.referencia} style={{ maxHeight: 90, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 12px rgba(0,52,180,0.14))' }} />
                  </div>
                  {fotosSecundarias.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {fotosSecundarias.map(f => (
                        <div key={f.label} style={{ background: '#f8faff', borderRadius: 8, padding: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', flex: 1, gap: 2 }}>
                          <img src={f.src} alt={f.label} style={{ maxHeight: fotosSecundarias.length > 1 ? 40 : 80, maxWidth: '100%', objectFit: 'contain' }} />
                          <div style={{ fontSize: 6, color: '#94a3b8', fontWeight: 600 }}>{f.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* COLORES — azul grisáceo */}
              {op?.colores && (
                <div style={{ marginBottom: 10, background: '#eef2f7', borderRadius: 8, padding: '7px 10px', border: '1.5px solid #c8d6e5' }}>
                  <div style={{ fontSize: 7.5, fontWeight: 800, color: '#2d4a6b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>🎨 Colores disponibles</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {op.colores.split(/[,;\/]/).map(c => c.trim()).filter(Boolean).map(color => (
                      <span key={color} style={{ background: '#dce6f0', border: '1.5px solid #9ab5cc', borderRadius: 20, padding: '2px 8px', fontSize: 8, fontWeight: 700, color: '#2d4a6b' }}>
                        {color}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* INCLUYE */}
              <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 11px', marginBottom: 10, border: '1.5px solid #bbf7d0' }}>
                <div style={{ fontSize: 8, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Esta cotización incluye</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px' }}>
                  {incluyeItems.map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check color="#16a34a" />
                      <span style={{ fontSize: 7.5, color: '#166534', fontWeight: 500 }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CONTACTO DIRECTO — siempre visible */}
              <div style={{ background: '#001a5e', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                <div style={{ fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Contacto directo</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px' }}>
                  {tenant.whatsapp ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ background: '#25d366', borderRadius: 4, width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, flexShrink: 0 }}>📱</div>
                      <div>
                        <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>WhatsApp</div>
                        <div style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>+{tenant.whatsapp}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, width: 15, height: 15, fontSize: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📱</div>
                      <div>
                        <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>WhatsApp</div>
                        <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.25)' }}>—</div>
                      </div>
                    </div>
                  )}
                  {tenant.telefono1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 12, flexShrink: 0 }}>☎️</span>
                      <div>
                        <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Teléfono</div>
                        <div style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>{tenant.telefono1}</div>
                      </div>
                    </div>
                  )}
                  {tenant.telefono2 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 12, flexShrink: 0 }}>📞</span>
                      <div>
                        <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Teléfono 2</div>
                        <div style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>{tenant.telefono2}</div>
                      </div>
                    </div>
                  )}
                  {tenant.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 12, flexShrink: 0 }}>✉️</span>
                      <div>
                        <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Email</div>
                        <div style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>{tenant.email}</div>
                      </div>
                    </div>
                  )}
                  {tenant.direccion && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, gridColumn: 'span 2' }}>
                      <span style={{ fontSize: 12, flexShrink: 0 }}>📍</span>
                      <div>
                        <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Dirección</div>
                        <div style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>{tenant.direccion}</div>
                      </div>
                    </div>
                  )}
                </div>
                {(tenant.instagram || tenant.facebook || tenant.tiktok) && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 8, paddingTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>Síguenos:</div>
                    {tenant.instagram && <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 11 }}>📸</span><span style={{ fontSize: 8, color: '#e879f9', fontWeight: 700 }}>{tenant.instagram}</span></div>}
                    {tenant.facebook  && <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 11 }}>👥</span><span style={{ fontSize: 8, color: '#60a5fa', fontWeight: 700 }}>{tenant.facebook}</span></div>}
                    {tenant.tiktok    && <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ fontSize: 11 }}>🎵</span><span style={{ fontSize: 8, color: '#f0abfc', fontWeight: 700 }}>{tenant.tiktok}</span></div>}
                  </div>
                )}
                {!tenant.instagram && !tenant.facebook && !tenant.tiktok && !tenant.whatsapp && !tenant.telefono1 && !tenant.email && !tenant.direccion && (
                  <div style={{ marginTop: 5, fontSize: 7, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                    Completa tus datos en Config. Ventas para que aparezcan aquí.
                  </div>
                )}
              </div>

              {/* NOTAS */}
              <div style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 11px', border: '1.5px solid #fde68a' }}>
                <div style={{ fontSize: 7.5, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>📝 Notas adicionales</div>
                {cotizacion.notas ? (
                  <div style={{ fontSize: 8, color: '#78350f', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{cotizacion.notas}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {['', '', ''].map((_, i) => <div key={i} style={{ borderBottom: '1px solid #fcd34d', height: 13 }} />)}
                  </div>
                )}
              </div>
            </div>

            {/* ─── COLUMNA DERECHA ─── */}
            <div style={{ padding: '13px 12px', background: '#f8faff', display: 'flex', flexDirection: 'column', gap: 9 }}>

              {/* PRECIO */}
              {(verContado || verPignorada) && (
                <div style={{ background: '#0052B4', borderRadius: 10, padding: '11px 13px' }}>
                  <div style={{ fontWeight: 800, fontSize: 9, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 5 }}>
                    Precio de tu moto
                  </div>
                  {verContado && (
                    <div style={{ marginBottom: verPignorada ? 8 : 0 }}>
                      <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>Contado con papeles</div>
                      <div style={{ fontSize: 21, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: -0.5 }}>{cop(conPapeles)}</div>
                      <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>IVA incluido · SOAT · Matrícula</div>
                    </div>
                  )}
                  {verPignorada && (
                    <div style={{ borderTop: verContado ? '1px solid rgba(255,255,255,0.2)' : 'none', paddingTop: verContado ? 8 : 0 }}>
                      <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>En crédito (pignorada)</div>
                      <div style={{ fontSize: verContado ? 17 : 21, fontWeight: 900, color: '#90d4f7', lineHeight: 1 }}>{cop(pignorada)}</div>
                      <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Incluye prenda · Con papeles</div>
                    </div>
                  )}
                </div>
              )}

              {/* RAZONES */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 10, padding: '10px 11px' }}>
                <div style={{ fontWeight: 800, fontSize: 8.5, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, borderBottom: '2px solid #0052B4', paddingBottom: 4 }}>
                  ¿Por qué es la decisión correcta?
                </div>
                {beneficios.map(({ icon, bg, title, desc }) => (
                  <div key={title} style={{ display: 'flex', gap: 7, marginBottom: 7, alignItems: 'flex-start' }}>
                    <div style={{ background: bg, borderRadius: 6, width: 25, height: 25, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 8, color: '#001a5e' }}>{title}</div>
                      <div style={{ fontSize: 7.5, color: '#475569', marginTop: 1, lineHeight: 1.3 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div style={{ background: 'linear-gradient(135deg, #001a5e, #0052B4)', borderRadius: 10, padding: '11px 12px', textAlign: 'center' }}>
                <div style={{ fontWeight: 900, fontSize: 12, color: '#fff', marginBottom: 2 }}>¡APARTA HOY!</div>
                <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.7)', marginBottom: 9, lineHeight: 1.4 }}>
                  No pierdas esta oportunidad.<br/>Estamos listos para atenderte.
                </div>
                {tenant.whatsapp && (
                  <div style={{ background: '#25d366', borderRadius: 7, padding: '6px 10px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                    <span style={{ fontSize: 15 }}>📱</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 }}>WhatsApp</div>
                      <div style={{ fontWeight: 800, fontSize: 10.5, color: '#fff' }}>{tenant.whatsapp}</div>
                    </div>
                  </div>
                )}
                {[{ icon: '☎️', val: tenant.telefono1 }, { icon: '✉️', val: tenant.email }].filter(c => c.val).map(c => (
                  <div key={c.val} style={{ display: 'flex', gap: 5, marginBottom: 3, alignItems: 'center' }}>
                    <span style={{ fontSize: 10 }}>{c.icon}</span>
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{c.val}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 8, paddingTop: 8, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'rgba(255,255,255,0.85)', fontSize: 10, lineHeight: 1.4 }}>
                  ¡Más que motos,<br/><strong>creamos experiencias!</strong>
                </div>
              </div>

              {/* BADGES */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, textAlign: 'center' }}>
                  {[
                    { icon: '🛡️', t: 'GARANTÍA', s: '12 MESES*' },
                    { icon: '⭐', t: 'CALIDAD',   s: 'CERTIFICADA' },
                    { icon: '👍', t: 'CLIENTES',  s: 'SATISFECHOS' },
                  ].map(b => (
                    <div key={b.t}>
                      <div style={{ fontSize: 17, marginBottom: 2 }}>{b.icon}</div>
                      <div style={{ fontSize: 6.5, fontWeight: 800, color: '#0052B4', lineHeight: 1.2 }}>{b.t}</div>
                      <div style={{ fontSize: 6, color: '#64748b', fontWeight: 600 }}>{b.s}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* TESTIMONIAL */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 17, color: '#0052B4', fontFamily: 'Georgia, serif', lineHeight: 1, marginBottom: 4 }}>&ldquo;</div>
                <div style={{ fontSize: 7.5, color: '#334155', fontStyle: 'italic', lineHeight: 1.5 }}>
                  Excelente atención. Me asesoraron perfectamente y la entrega fue rápida y sin complicaciones.
                </div>
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 19, height: 19, borderRadius: '50%', background: '#0052B4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 8, fontWeight: 800, flexShrink: 0 }}>C</div>
                  <div>
                    <div style={{ fontSize: 7, fontWeight: 700, color: '#1e293b' }}>Cliente satisfecho</div>
                    <div style={{ fontSize: 8, color: '#f59e0b', lineHeight: 1 }}>⭐⭐⭐⭐⭐</div>
                  </div>
                </div>
              </div>

              {/* ESPECIFICACIONES TÉCNICAS — al final */}
              {specsCheck.length > 0 && (
                <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, paddingBottom: 4, borderBottom: '1.5px solid #dde3f0' }}>
                    Especificaciones técnicas
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2px 0' }}>
                    {specsCheck.map(s => (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0' }}>
                        <Check />
                        <span style={{ fontSize: 7.5, color: '#334155' }}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ══ FOOTER ══ */}
          <div style={{ background: 'linear-gradient(135deg, #001a5e 0%, #003087 50%, #0052B4 100%)', padding: '10px 24px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 7, textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: 1 }}>Tu próxima aventura</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 900, letterSpacing: -0.5, textTransform: 'uppercase', lineHeight: 1 }}>¡COMIENZA AQUÍ!</div>
              <div style={{ fontSize: 6.5, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                Precios sujetos a cambio sin previo aviso · Vigencia: {cotizacion.vigencia_dias} días naturales
              </div>
            </div>
            <div style={{ textAlign: 'center', maxWidth: 150 }}>
              <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                En {tenant.nombre || 'nuestro concesionario'} nos apasiona<br/>acompañarte en cada kilómetro.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {tenant.logo_uri && (
                <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 26, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.85 }} />
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
