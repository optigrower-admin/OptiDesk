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

// Íconos SVG inline para no depender de librerías externas
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#0052B4"/>
      <path d="M7 12.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function CotizacionDoc({ cotizacion, tenant }: Props) {
  const whatsappNum  = tenant.whatsapp?.replace(/\D/g, '') ?? ''
  const whatsappLink = whatsappNum ? `https://wa.me/${whatsappNum}` : '#'

  const portada = cotizacion.opciones[0]?.foto_promo_uri
    || cotizacion.opciones[0]?.foto_lado_uri
    || cotizacion.opciones[0]?.foto_frente_uri
    || ''

  const razones = [
    { icon: '🛡️', title: 'GARANTÍA REAL',            desc: 'Respaldo total en todas nuestras unidades.' },
    { icon: '🔧', title: 'SERVICIO ESPECIALIZADO',    desc: 'Taller certificado y refacciones originales.' },
    { icon: '🚚', title: 'ENTREGA A CONVENIR',        desc: 'Llevamos tu unidad hasta donde la necesites.' },
    { icon: '💳', title: 'FACILIDADES DE PAGO',       desc: 'Opciones de financiamiento a tu medida.' },
    { icon: '🎓', title: 'ASESORÍA PERSONALIZADA',    desc: 'Te ayudamos a elegir la mejor opción para ti.' },
  ]

  const specs = (op: OpcionCotizacion) => [
    op.cilindraje    && `Motor ${op.cilindraje}`,
    op.potencia      && `${op.potencia}`,
    op.frenos        && op.frenos,
    op.combustible   && op.combustible,
    op.garantia      && op.garantia,
    op.caracteristica && op.caracteristica,
  ].filter(Boolean) as string[]

  const S: Record<string, React.CSSProperties> = {
    page:        { width: '210mm', background: '#fff', fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 11, color: '#1a1a2e' },
    sectionTitle:{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 },
    label:       { fontSize: 9.5, fontWeight: 700, color: '#0052B4', textTransform: 'uppercase' as const, letterSpacing: 1 },
    fieldRow:    { display: 'flex', gap: 6, marginBottom: 7, alignItems: 'flex-end' },
    fieldLabel:  { fontSize: 9.5, color: '#444', minWidth: 72, flexShrink: 0 },
    fieldLine:   { flex: 1, borderBottom: '1px solid #b0b8cc', paddingBottom: 1, fontSize: 9.5, color: '#1a1a2e', fontWeight: 500 },
  }

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body { margin: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          .cot-page { box-shadow: none !important; }
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
        <div className="cot-page" style={{ ...S.page, boxShadow: '0 8px 60px rgba(0,0,0,0.2)' }}>

          {/* ══ ENCABEZADO ══════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '55% 45%', minHeight: 120, overflow: 'hidden', position: 'relative', background: '#fff' }}>

            {/* Izquierda: Logo + tagline + geometric accent */}
            <div style={{ padding: '22px 24px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
              {tenant.logo_uri
                ? <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 60, objectFit: 'contain', objectPosition: 'left', marginBottom: 6 }} />
                : <div style={{ fontSize: 28, fontWeight: 900, color: '#0052B4', letterSpacing: -1, textTransform: 'uppercase' }}>{tenant.nombre}</div>
              }
              {tenant.tagline && (
                <div style={{ fontSize: 8.5, color: '#5a6a8a', letterSpacing: 2.5, textTransform: 'uppercase', fontWeight: 600, marginTop: 2 }}>
                  {tenant.tagline}
                </div>
              )}
            </div>

            {/* Derecha: Foto con clip diagonal */}
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              {/* Forma azul de fondo */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0035a0, #0052B4, #0066cc)', clipPath: 'polygon(18% 0%, 100% 0%, 100% 100%, 0% 100%)' }} />
              {/* Foto encima */}
              {portada && (
                <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(22% 0%, 100% 0%, 100% 100%, 4% 100%)' }}>
                  <img src={portada} alt="moto" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,52,160,0.35) 0%, transparent 60%)' }} />
                </div>
              )}
              {/* Accent decorativo */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, width: '30%', height: '100%', background: 'linear-gradient(135deg, #0052B4, transparent)', clipPath: 'polygon(0 0, 100% 100%, 0 100%)', opacity: 0.3 }} />
            </div>
          </div>

          {/* Barra contacto */}
          <div style={{ background: '#f4f6fb', borderTop: '1px solid #dde3f0', borderBottom: '2px solid #0052B4', display: 'flex', gap: 0 }}>
            {[
              { icon: '📍', text: tenant.direccion },
              { icon: '📞', text: [tenant.telefono1, tenant.telefono2].filter(Boolean).join(' / ') },
              { icon: '✉️', text: tenant.email },
              { icon: '🌐', text: tenant.web },
            ].filter(c => c.text).map(c => (
              <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRight: '1px solid #dde3f0', flex: '1 1 0' }}>
                <span style={{ fontSize: 12, flexShrink: 0 }}>{c.icon}</span>
                <span style={{ fontSize: 9, color: '#444', lineHeight: 1.3 }}>{c.text}</span>
              </div>
            ))}
          </div>

          {/* ══ CUERPO PRINCIPAL: 2 columnas ══════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '62% 38%', minHeight: 680, alignItems: 'start' }}>

            {/* ─── COLUMNA IZQUIERDA ──────────────────────────────── */}
            <div style={{ padding: '18px 20px 16px', borderRight: '1px solid #e8edf5' }}>

              {/* DATOS DEL CLIENTE */}
              <div style={{ marginBottom: 18 }}>
                <div style={S.sectionTitle}>
                  <svg width="16" height="16" fill="#0052B4" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  <span style={S.label}>Datos del cliente</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                  {[
                    ['Empresa / Nombre', cotizacion.cliente_nombre],
                    ['Contacto', ''],
                    ['Teléfono', cotizacion.cliente_celular],
                    ['Correo electrónico', cotizacion.cliente_email],
                    ['Dirección', ''],
                    ['Ciudad / Estado', ''],
                  ].map(([label, val]) => (
                    <div key={label} style={S.fieldRow}>
                      <span style={S.fieldLabel}>{label}:</span>
                      <span style={S.fieldLine}>{val ?? ''}</span>
                    </div>
                  ))}
                </div>

                {/* Texto cursiva decorativo */}
                <div style={{ marginTop: 10, padding: '8px 12px', borderLeft: '3px solid #0052B4', background: '#f0f5ff', borderRadius: '0 8px 8px 0' }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 12, color: '#0052B4', lineHeight: 1.5 }}>
                    Cuéntanos lo que necesitas<br />
                    <strong>y te ayudamos a elegir la mejor opción.</strong>
                  </div>
                </div>
              </div>

              {/* OPCIONES DISPONIBLES */}
              <div style={{ marginBottom: 16 }}>
                <div style={S.sectionTitle}>
                  <span style={{ fontSize: 16 }}>🏍️</span>
                  <span style={S.label}>Opciones disponibles</span>
                </div>
                <div style={{ fontSize: 9, color: '#666', marginBottom: 10, fontStyle: 'italic' }}>
                  Elige la opción que mejor se adapte a tus necesidades.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cotizacion.opciones.length, 3)}, 1fr)`, gap: 10 }}>
                  {cotizacion.opciones.slice(0, 3).map((op, idx) => {
                    const foto = op.foto_promo_uri || op.foto_lado_uri || op.foto_frente_uri
                    const sp   = specs(op)
                    return (
                      <div key={op.moto_catalogo_id} style={{ border: '1.5px solid #dde3f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>

                        {/* Número badge */}
                        <div style={{ padding: '8px 10px 4px', display: 'flex', justifyContent: 'center' }}>
                          <div style={{ background: '#0052B4', color: '#fff', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>
                            {idx + 1}
                          </div>
                        </div>

                        {/* Foto */}
                        <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', background: '#f8fafc' }}>
                          {foto
                            ? <img src={foto} alt={op.referencia} style={{ maxHeight: 95, maxWidth: '100%', objectFit: 'contain' }} />
                            : <span style={{ fontSize: 36 }}>🏍️</span>
                          }
                        </div>

                        {/* Nombre */}
                        <div style={{ padding: '8px 10px 4px', borderTop: '1px solid #eef0f6' }}>
                          <div style={{ fontWeight: 800, fontSize: 11, color: '#001a5e', lineHeight: 1.2 }}>{op.referencia}</div>
                          {op.tagline_venta && (
                            <div style={{ fontSize: 8.5, color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>{op.tagline_venta}</div>
                          )}
                        </div>

                        {/* Specs con checkmarks */}
                        <div style={{ padding: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {sp.slice(0, 5).map(s => (
                            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <IconCheck />
                              <span style={{ fontSize: 9, color: '#334155' }}>{s}</span>
                            </div>
                          ))}
                          {op.colores && (
                            <div style={{ fontSize: 8.5, color: '#64748b', marginTop: 2 }}>🎨 {op.colores}</div>
                          )}
                        </div>

                        {/* Precio */}
                        <div style={{ background: '#f0f5ff', borderTop: '1.5px solid #dde3f0', padding: '8px 10px' }}>
                          <div style={{ fontSize: 8.5, fontWeight: 700, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Precio unitario</div>
                          {op.mostrar_precio ? (
                            <div style={{ fontSize: 14, fontWeight: 900, color: '#001a5e' }}>{cop(op.precio + op.costo_documentos)}</div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#1a1a2e' }}>$</span>
                              <div style={{ flex: 1, borderBottom: '1.5px solid #334155', height: 16 }} />
                              <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>COP</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* 4ª opción en layout especial si existe */}
                {cotizacion.opciones[3] && (() => {
                  const op   = cotizacion.opciones[3]
                  const foto = op.foto_promo_uri || op.foto_lado_uri || op.foto_frente_uri
                  const sp   = specs(op)
                  return (
                    <div style={{ marginTop: 12, border: '1.5px solid #86efac', borderRadius: 10, overflow: 'hidden', background: '#f0fdf4' }}>
                      <div style={{ background: '#16a34a', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>🚗</span>
                        <span style={{ color: '#fff', fontWeight: 800, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1 }}>Opción adicional</span>
                        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '2px 10px', border: '1px solid rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
                          <span style={{ color: '#fff', fontSize: 8.5, fontWeight: 700 }}>OPCIÓN 4</span>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 10, padding: 12, alignItems: 'start' }}>
                        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {foto ? <img src={foto} alt={op.referencia} style={{ maxHeight: 78, maxWidth: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 36 }}>🏍️</span>}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 11, color: '#14532d', marginBottom: 6 }}>{op.referencia}</div>
                          {sp.slice(0, 4).map(s => (
                            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#16a34a"/><path d="M7 12.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              <span style={{ fontSize: 9, color: '#166534' }}>{s}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                          {op.tagline_venta && (
                            <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 10.5, color: '#166534', lineHeight: 1.4, marginBottom: 8 }}>{op.tagline_venta}</div>
                          )}
                          <div style={{ background: '#dcfce7', borderRadius: 6, padding: '6px 10px', border: '1px solid #86efac' }}>
                            <div style={{ fontSize: 8.5, fontWeight: 700, color: '#166534', textTransform: 'uppercase', marginBottom: 3 }}>Precio unitario</div>
                            {op.mostrar_precio ? (
                              <div style={{ fontSize: 13, fontWeight: 900, color: '#14532d' }}>{cop(op.precio + op.costo_documentos)}</div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700 }}>$</span>
                                <div style={{ flex: 1, borderBottom: '1.5px solid #166534', height: 14 }} />
                                <span style={{ fontSize: 9, color: '#166534', fontWeight: 600 }}>COP</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* OBSERVACIONES + TOTALES */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
                <div>
                  <div style={{ ...S.sectionTitle, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>💬</span>
                    <span style={S.label}>Observaciones</span>
                  </div>
                  <div style={{ border: '1px solid #dde3f0', borderRadius: 8, padding: 10, minHeight: 70, fontSize: 9.5, color: '#334155', background: '#fafbfc', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {cotizacion.notas || ''}
                  </div>
                </div>
                <div>
                  <div style={{ ...S.sectionTitle, marginBottom: 6 }}>
                    <span style={S.label}>Resumen</span>
                  </div>
                  {([
                    ['Subtotal', '', false],
                    ['IVA (19%)', '', false],
                    ['TOTAL', '', true],
                  ] as [string, string, boolean][]).map(([label, val, bold]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: bold ? '7px 10px' : '5px 10px', background: bold ? '#0052B4' : '#f4f6fb', marginBottom: 3, borderRadius: 6 }}>
                      <span style={{ fontSize: 9.5, fontWeight: bold ? 800 : 600, color: bold ? '#fff' : '#334155', textTransform: 'uppercase' as const }}>{label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 9.5, fontWeight: bold ? 800 : 600, color: bold ? '#fff' : '#334155' }}>$</span>
                        <div style={{ width: 60, borderBottom: `1.5px solid ${bold ? 'rgba(255,255,255,0.5)' : '#334155'}`, height: 14 }} />
                        <span style={{ fontSize: 8.5, color: bold ? 'rgba(255,255,255,0.8)' : '#64748b' }}>COP</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ─── COLUMNA DERECHA (SIDEBAR) ──────────────────────── */}
            <div style={{ padding: '18px 16px', background: '#f8faff', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Tarjeta cotización */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ color: '#0052B4', fontWeight: 900, fontSize: 22, letterSpacing: -0.5, textTransform: 'uppercase', lineHeight: 1, marginBottom: 10 }}>COTIZACIÓN</div>
                {[
                  ['No.', `MS-${pad(cotizacion.numero)}`],
                  ['Fecha', formatFecha(cotizacion.fecha_generacion)],
                  ['Vigencia', `${cotizacion.vigencia_dias} días naturales`],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #eef0f6' }}>
                    <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' as const }}>{k}</span>
                    <span style={{ fontSize: k === 'No.' ? 13 : 9.5, fontWeight: 800, color: '#001a5e', background: k === 'No.' ? '#eff6ff' : 'transparent', padding: k === 'No.' ? '2px 8px' : 0, borderRadius: 4 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Por qué elegirnos */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontWeight: 800, fontSize: 10.5, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, borderBottom: '2px solid #0052B4', paddingBottom: 6 }}>
                  Por qué elegirnos
                </div>
                {razones.map(({ icon, title, desc }) => (
                  <div key={title} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                    <div style={{ background: '#eff6ff', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, border: '1px solid #bfdbfe' }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 9.5, color: '#001a5e', textTransform: 'uppercase', letterSpacing: 0.3 }}>{title}</div>
                      <div style={{ fontSize: 9, color: '#475569', marginTop: 1, lineHeight: 1.4 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ¿Listo para continuar? */}
              <div style={{ background: '#0052B4', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontWeight: 900, fontSize: 12, color: '#fff', marginBottom: 3 }}>¿LISTO PARA CONTINUAR?</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', marginBottom: 12 }}>Estamos listos para ayudarte.</div>
                {[
                  { icon: '📱', label: 'WhatsApp',  val: tenant.whatsapp  },
                  { icon: '☎️', label: 'Llámanos',  val: tenant.telefono1 },
                  { icon: '✉️', label: 'Escríbenos', val: tenant.email    },
                  { icon: '📍', label: 'Visítanos',  val: tenant.direccion },
                ].filter(c => c.val).map(c => (
                  <div key={c.label} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{c.icon}</span>
                    <div>
                      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 1 }}>{c.label}</div>
                      <div style={{ fontSize: 9.5, color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>{c.val}</div>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 12, paddingTop: 10, fontFamily: 'Georgia, serif', fontStyle: 'italic', color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 1.4, textAlign: 'center' }}>
                  ¡Más que motos,<br /><strong>creamos experiencias!</strong>
                </div>
              </div>

            </div>
          </div>

          {/* ══ PRE-FOOTER ══════════════════════════════════════════════ */}
          <div style={{ background: '#f4f6fb', borderTop: '2px solid #dde3f0', padding: '14px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'center' }}>
            {/* ¡Aparta tu unidad! */}
            <div>
              <div style={{ fontWeight: 900, fontSize: 12, color: '#0052B4', textTransform: 'uppercase', marginBottom: 4 }}>¡Aparta tu unidad ahora!</div>
              <div style={{ fontSize: 8.5, color: '#475569', lineHeight: 1.4 }}>Precios y disponibilidad sujetos a cambio sin previo aviso.</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 14 }}>⏰</span>
                <span style={{ fontSize: 8.5, fontWeight: 700, color: '#334155' }}>Cotización válida por {cotizacion.vigencia_dias} días naturales</span>
              </div>
            </div>
            {/* Badges */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              {[
                { icon: '🛡️', title: 'GARANTÍA', sub: '12 MESES*' },
                { icon: '⭐', title: 'CALIDAD', sub: 'GARANTIZADA' },
                { icon: '👍', title: 'MILES DE', sub: 'CLIENTES FELICES' },
              ].map(b => (
                <div key={b.title} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 3 }}>{b.icon}</div>
                  <div style={{ fontSize: 8, fontWeight: 800, color: '#0052B4', lineHeight: 1.2 }}>{b.title}</div>
                  <div style={{ fontSize: 7.5, color: '#475569', fontWeight: 600 }}>{b.sub}</div>
                </div>
              ))}
            </div>
            {/* Mini testimonial */}
            <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #dde3f0' }}>
              <div style={{ fontSize: 18, color: '#0052B4', fontFamily: 'Georgia, serif', lineHeight: 1, marginBottom: 4 }}>&ldquo;</div>
              <div style={{ fontSize: 8.5, color: '#334155', fontStyle: 'italic', lineHeight: 1.4 }}>
                Excelente atención, me ayudaron a escoger la moto perfecta. ¡Todo rápido y sin complicaciones!
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#0052B4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 800 }}>C</div>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#1e293b' }}>Cliente satisfecho</div>
                  <div style={{ fontSize: 7.5, color: '#64748b' }}>⭐⭐⭐⭐⭐</div>
                </div>
              </div>
            </div>
          </div>

          {/* ══ FOOTER ══════════════════════════════════════════════════ */}
          <div style={{ background: 'linear-gradient(135deg, #001a5e 0%, #0035a0 50%, #0052B4 100%)', padding: '0', overflow: 'hidden', position: 'relative' }}>
            {/* Foto de fondo footer */}
            {portada && (
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '35%', opacity: 0.2 }}>
                <img src={portada} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center' }} />
              </div>
            )}
            <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '16px 28px', gap: 20 }}>
              {/* Izquierda */}
              <div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 2 }}>Tu próxima aventura</div>
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, letterSpacing: -0.5, textTransform: 'uppercase', lineHeight: 1 }}>¡COMIENZA AQUÍ!</div>
              </div>
              {/* Centro: texto */}
              <div style={{ textAlign: 'center', maxWidth: 200 }}>
                <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
                  En {tenant.nombre || 'nuestro concesionario'} nos apasiona lo que hacemos<br />
                  y estamos listos para acompañarte en cada kilómetro.
                </div>
                {/* Social */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8 }}>
                  {['📘', '📸', '▶️'].map((ic, i) => (
                    <div key={i} style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{ic}</div>
                  ))}
                </div>
              </div>
              {/* Derecha: Logo */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {tenant.logo_uri
                  ? <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
                  : <div style={{ color: '#fff', fontWeight: 900, fontSize: 16, textTransform: 'uppercase' }}>{tenant.nombre}</div>
                }
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
