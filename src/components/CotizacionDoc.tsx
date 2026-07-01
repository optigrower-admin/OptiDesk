'use client'
import type { OpcionCotizacion } from '@/app/admin/cotizaciones/[id]/page'

const OPTION_COLORS  = ['#0052B4', '#1a3a6b', '#003087']
const OPTION_LABELS  = ['OPCIÓN 1', 'OPCIÓN 2', 'OPCIÓN 3']

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

const SPEC_ICONS: Record<string, string> = {
  cilindraje: '⚙️', potencia: '⚡', frenos: '🛡️',
  combustible: '🔧', rendimiento: '⛽', velocidad_max: '🏁',
  garantia: '✅', caracteristica: '✨',
}

export default function CotizacionDoc({ cotizacion, tenant }: Props) {
  const whatsappNum  = tenant.whatsapp?.replace(/\D/g, '') ?? ''
  const whatsappLink = whatsappNum ? `https://wa.me/${whatsappNum}` : '#'

  // Foto de portada = foto promocional o lateral de la primera moto
  const portada = cotizacion.opciones[0]?.foto_promo_uri
    || cotizacion.opciones[0]?.foto_lado_uri
    || cotizacion.opciones[0]?.foto_frente_uri
    || ''

  const specs = (op: OpcionCotizacion) =>
    (['cilindraje','potencia','frenos','combustible','rendimiento','velocidad_max','garantia','caracteristica'] as const)
      .filter(k => op[k])
      .map(k => ({ icon: SPEC_ICONS[k], label: op[k] as string }))

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body { margin: 0 !important; }
          .no-print { display: none !important; }
        }
        body { margin: 0; background: #f3f4f6; }
        * { box-sizing: border-box; }
        .cot-root { font-family: 'Segoe UI', Arial, sans-serif; }
      `}</style>

      {/* ── TOOLBAR (solo pantalla) ── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white flex items-center justify-between px-6 py-3 shadow-lg">
        <button onClick={() => window.history.back()} className="text-sm text-gray-300 hover:text-white transition-colors">← Volver</button>
        <span className="font-semibold text-sm">Cotización #{pad(cotizacion.numero)}</span>
        <div className="flex gap-3">
          {whatsappNum && (
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </a>
          )}
          <button onClick={() => window.print()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* ── DOCUMENTO ── */}
      <div className="cot-root no-print:mt-16 min-h-screen bg-gray-200 flex justify-center py-8 px-4 print:p-0 print:bg-white print:mt-0">
        <div style={{ width: '210mm', background: '#fff', boxShadow: '0 8px 60px rgba(0,0,0,0.18)' }}>

          {/* ══ ENCABEZADO ══════════════════════════════════════════════════ */}
          <div style={{ position: 'relative', background: 'linear-gradient(135deg, #001a5e 0%, #0035a0 40%, #0052B4 75%, #0066cc 100%)', minHeight: 220, overflow: 'hidden' }}>

            {/* Fondo geométrico (siempre visible) */}
            <svg style={{ position: 'absolute', right: 0, top: 0, height: '100%', opacity: 0.07 }} viewBox="0 0 500 300" fill="white" xmlns="http://www.w3.org/2000/svg">
              <polygon points="500,0 500,300 200,300 350,0"/>
              <polygon points="500,0 380,0 300,300 500,300" opacity="0.5"/>
            </svg>

            {/* Foto de la moto como fondo derecho con degradé */}
            {portada && (
              <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '55%' }}>
                <img src={portada} alt="Moto" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
                {/* Overlay degradé izquierda */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, #0035a0 5%, rgba(0,52,160,0.75) 35%, rgba(0,52,160,0.2) 70%, transparent 100%)' }} />
                {/* Overlay oscuro superior */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,26,94,0.4) 0%, transparent 50%)' }} />
              </div>
            )}

            {/* Contenido principal */}
            <div style={{ position: 'relative', zIndex: 2, padding: '28px 36px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>

              {/* Izquierda: Logo + título */}
              <div style={{ maxWidth: portada ? '55%' : '70%' }}>
                {/* Logo */}
                {tenant.logo_uri && (
                  <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 52, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 14, display: 'block' }} />
                )}
                {!tenant.logo_uri && (
                  <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>{tenant.nombre}</div>
                )}

                {/* COTIZACIÓN */}
                <div style={{ color: '#fff', fontSize: 58, fontWeight: 900, letterSpacing: -2, lineHeight: 0.88, textTransform: 'uppercase', textShadow: '0 2px 20px rgba(0,0,0,0.4)' }}>
                  COTIZACIÓN
                </div>

                {/* Tagline */}
                <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 10, fontStyle: 'italic' }}>
                  Tu próxima <span style={{ fontStyle: 'normal', fontWeight: 800, color: '#90d4f7' }}>aventura</span> comienza aquí
                </div>

                {tenant.tagline && (
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9.5, letterSpacing: 3, textTransform: 'uppercase', marginTop: 6 }}>
                    {tenant.tagline}
                  </div>
                )}
              </div>

              {/* Derecha: Tarjeta número de cotización */}
              <div style={{ background: 'rgba(255,255,255,0.13)', borderRadius: 14, padding: '16px 20px', minWidth: 172, border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(4px)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 8px', border: '1px solid rgba(255,255,255,0.3)' }}>
                    <svg width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5 }}>No. Cotización</div>
                    <div style={{ background: '#1a56db', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 15, fontWeight: 900, display: 'inline-block', marginTop: 3, letterSpacing: 0.5 }}>
                      MS-{pad(cotizacion.numero)}
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['📅', 'Fecha', formatFecha(cotizacion.fecha_generacion)],
                    ['⏰', 'Vigencia', `${cotizacion.vigencia_dias} días`],
                  ].map(([icon, label, val]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>{icon}</span>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                        <div style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{val}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Barra de contacto */}
          <div style={{ background: '#001a5e', display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {tenant.direccion && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRight: '1px solid rgba(255,255,255,0.1)', flex: '2 1 auto' }}>
                <span style={{ fontSize: 13 }}>📍</span>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9.5 }}>{tenant.direccion}</span>
              </div>
            )}
            {(tenant.telefono1 || tenant.telefono2) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: 13 }}>📞</span>
                <div>
                  {tenant.telefono1 && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9.5 }}>{tenant.telefono1}</div>}
                  {tenant.telefono2 && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9.5 }}>{tenant.telefono2}</div>}
                </div>
              </div>
            )}
            {(tenant.email || tenant.web) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px' }}>
                <span style={{ fontSize: 13 }}>✉️</span>
                <div>
                  {tenant.email && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9.5 }}>{tenant.email}</div>}
                  {tenant.web    && <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9.5 }}>{tenant.web}</div>}
                </div>
              </div>
            )}
          </div>

          {/* ══ CUERPO ══════════════════════════════════════════════════════ */}
          <div style={{ padding: '22px 32px' }}>

            {/* Datos del cliente + ¿Por qué elegirnos? */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 22 }}>

              {/* Datos cliente */}
              <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', background: '#fafbfc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ background: '#0052B4', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 11, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1 }}>Datos del cliente</span>
                </div>
                {[
                  ['Nombre', cotizacion.cliente_nombre],
                  ['Celular', cotizacion.cliente_celular],
                  ['Correo', cotizacion.cliente_email],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 9, fontSize: 11 }}>
                    <span style={{ color: '#64748b', minWidth: 50, flexShrink: 0 }}>{label}:</span>
                    <span style={{ borderBottom: '1px solid #cbd5e1', flex: 1, paddingBottom: 2, color: val ? '#0f172a' : 'transparent', fontWeight: val ? 600 : 400 }}>
                      {val ?? ' '}
                    </span>
                  </div>
                ))}
                {/* Campos vacíos extra */}
                {['Teléfono adicional', 'Dirección'].map(label => (
                  <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 9, fontSize: 11 }}>
                    <span style={{ color: '#64748b', minWidth: 50, flexShrink: 0 }}>{label.length > 8 ? label.slice(0, 8) + '.' : label}:</span>
                    <span style={{ borderBottom: '1px solid #cbd5e1', flex: 1, paddingBottom: 2 }}>&nbsp;</span>
                  </div>
                ))}
              </div>

              {/* ¿Por qué elegirnos? */}
              <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: 12, padding: '16px 18px', border: '1.5px solid #bfdbfe' }}>
                <div style={{ fontWeight: 800, fontSize: 11, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  ¿Por qué elegirnos?
                </div>
                {[
                  { icon: '🛡️', bg: '#dbeafe', title: 'Motos de calidad',       desc: 'Marcas reconocidas y alto rendimiento.' },
                  { icon: '🔧', bg: '#dcfce7', title: 'Taller especializado',    desc: 'Mecánicos certificados siempre listos.' },
                  { icon: '🤝', bg: '#fce7f3', title: 'Respaldo y garantía',     desc: 'Tu inversión protegida en todo momento.' },
                  { icon: '💳', bg: '#fef9c3', title: 'Financiamiento fácil',    desc: 'Con las mejores entidades del país.' },
                ].map(({ icon, bg, title, desc }) => (
                  <div key={title} style={{ display: 'flex', gap: 10, marginBottom: 9, alignItems: 'flex-start' }}>
                    <div style={{ background: bg, borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b' }}>{title}</div>
                      <div style={{ fontSize: 9.5, color: '#475569', marginTop: 1 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ══ OPCIONES DISPONIBLES ══ */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ background: '#0052B4', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏍️</div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 15, color: '#001a5e', textTransform: 'uppercase', letterSpacing: 1 }}>Opciones disponibles</div>
                  <div style={{ height: 3, background: 'linear-gradient(to right, #0052B4, #90d4f7, transparent)', borderRadius: 2, marginTop: 4, width: 200 }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cotizacion.opciones.length, 3)}, 1fr)`, gap: 14 }}>
                {cotizacion.opciones.slice(0, 3).map((op, idx) => {
                  const color = OPTION_COLORS[idx]
                  const sp = specs(op)
                  const foto = op.foto_promo_uri || op.foto_lado_uri || op.foto_frente_uri

                  return (
                    <div key={op.moto_catalogo_id} style={{ borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${color}30`, boxShadow: `0 4px 20px ${color}20` }}>

                      {/* Banner opción */}
                      <div style={{ background: color, padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#fff', fontWeight: 900, fontSize: 11, letterSpacing: 2 }}>{OPTION_LABELS[idx]}</span>
                        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '2px 10px', border: '1px solid rgba(255,255,255,0.3)' }}>
                          <span style={{ color: '#fff', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5 }}>OFERTA ESPECIAL</span>
                        </div>
                      </div>

                      {/* Foto */}
                      <div style={{ background: foto ? '#f0f4ff' : '#f8fafc', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                        {foto ? (
                          <>
                            <img src={foto} alt={op.referencia} style={{ maxHeight: 155, maxWidth: '100%', objectFit: 'contain', display: 'block', padding: '4px 8px' }} />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30, background: `linear-gradient(transparent, ${color}18)` }} />
                          </>
                        ) : (
                          <div style={{ textAlign: 'center', color: '#cbd5e1' }}>
                            <div style={{ fontSize: 40, marginBottom: 4 }}>🏍️</div>
                            <div style={{ fontSize: 10 }}>Sin foto</div>
                          </div>
                        )}
                      </div>

                      {/* Nombre + tagline */}
                      <div style={{ padding: '12px 14px 8px', borderBottom: `2px solid ${color}15` }}>
                        <div style={{ fontWeight: 900, fontSize: 15, color: '#0f172a', letterSpacing: -0.5 }}>{op.referencia}</div>
                        {op.tagline_venta && (
                          <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', marginTop: 3 }}>{op.tagline_venta}</div>
                        )}
                      </div>

                      {/* Specs */}
                      {sp.length > 0 && (
                        <div style={{ padding: '8px 14px 10px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {sp.slice(0, 5).map(s => (
                              <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 7px', fontSize: 9.5, fontWeight: 600, color: '#334155' }}>
                                <span style={{ fontSize: 10 }}>{s.icon}</span> {s.label}
                              </span>
                            ))}
                          </div>
                          {op.colores && (
                            <div style={{ marginTop: 6, fontSize: 9.5, color: '#64748b' }}>
                              🎨 <span style={{ fontWeight: 600 }}>{op.colores}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Precio */}
                      <div style={{ margin: '2px 12px 12px', background: `linear-gradient(135deg, ${color}, ${color}cc)`, borderRadius: 9, padding: '10px 14px', textAlign: 'center' }}>
                        {op.mostrar_precio ? (
                          <>
                            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>Precio con documentos</div>
                            <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, marginTop: 2 }}>{cop(op.precio + op.costo_documentos)}</div>
                          </>
                        ) : (
                          <div style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>Precio a cotizar</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Nota precios */}
            <p style={{ color: '#94a3b8', fontSize: 8.5, textAlign: 'center', margin: '6px 0 14px', fontStyle: 'italic' }}>
              * Precios sujetos a cambios sin previo aviso. Aplican términos y condiciones.
            </p>

            {/* ══ INCLUYE ══ */}
            <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: 12, padding: '16px 20px', marginBottom: cotizacion.notas ? 14 : 16, border: '1.5px solid #bbf7d0' }}>
              <div style={{ fontWeight: 800, fontSize: 11, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Incluye</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { icon: '🛡️', bg: '#dcfce7', label: 'Garantía oficial' },
                  { icon: '🔩', bg: '#dbeafe', label: 'Repuestos disponibles' },
                  { icon: '💰', bg: '#fef9c3', label: 'Financiamiento opcional' },
                  { icon: '🎓', bg: '#fce7f3', label: 'Asesoría en matrícula' },
                ].map(({ icon, bg, label }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ background: bg, borderRadius: 50, width: 44, height: 44, margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{icon}</div>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#166534' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notas (solo si hay) */}
            {cotizacion.notas && (
              <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 10.5, color: '#92400e', marginBottom: 4 }}>📝 Notas adicionales</div>
                <div style={{ fontSize: 10.5, color: '#78350f', whiteSpace: 'pre-line' }}>{cotizacion.notas}</div>
              </div>
            )}

            {/* Frase cierre */}
            <div style={{ borderLeft: '4px solid #0052B4', padding: '10px 16px', marginBottom: 4, background: 'linear-gradient(to right, #eff6ff, transparent)', borderRadius: '0 8px 8px 0' }}>
              <p style={{ fontSize: 12, color: '#0f172a', fontStyle: 'italic', margin: 0 }}>
                &quot;No solo vendemos motos,<br /><strong style={{ color: '#0052B4' }}>acompañamos tu camino.</strong>&quot;
              </p>
            </div>
          </div>

          {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
          <div style={{ background: 'linear-gradient(135deg, #001a5e 0%, #003087 100%)', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, marginBottom: 3 }}>¡Hablemos!</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10.5 }}>Estamos listos para ayudarte a elegir la mejor opción.</div>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              {tenant.whatsapp && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ background: '#25d366', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 18 }}>📱</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>WhatsApp</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#fff' }}>{tenant.whatsapp}</div>
                  </div>
                </div>
              )}
              {tenant.telefono1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 18 }}>☎️</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1 }}>Llámanos</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#fff' }}>{tenant.telefono1}</div>
                  </div>
                </div>
              )}
              {tenant.logo_uri && (
                <img src={tenant.logo_uri} alt="Logo" style={{ height: 34, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.9 }} />
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
