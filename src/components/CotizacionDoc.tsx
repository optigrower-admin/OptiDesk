'use client'
import type { OpcionCotizacion } from '@/app/admin/cotizaciones/[id]/page'

const OPTION_COLORS = ['#0052B4', '#1a3a6b', '#003087']
const OPTION_LABEL = ['OPCIÓN 1', 'OPCIÓN 2', 'OPCIÓN 3']

function formatCOP(n: number) {
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

function pad(n: number) { return String(n).padStart(4, '0') }

interface TenantInfo {
  nombre: string
  logo_uri: string
  tagline: string
  direccion: string
  telefono1: string
  telefono2: string
  email: string
  web: string
  whatsapp: string
}

interface Cotizacion {
  id: string
  numero: number
  fecha_generacion: string
  vigencia_dias: number
  cliente_nombre?: string
  cliente_celular?: string
  cliente_email?: string
  opciones: OpcionCotizacion[]
  notas?: string
}

interface Props {
  cotizacion: Cotizacion
  tenant: TenantInfo
}

const SPEC_ICONS: Record<string, string> = {
  cilindraje: '⚙️',
  potencia: '⚡',
  frenos: '🛡️',
  combustible: '🔧',
  rendimiento: '⛽',
  velocidad_max: '🏁',
  garantia: '✅',
  caracteristica: '✨',
}

export default function CotizacionDoc({ cotizacion, tenant }: Props) {
  const whatsappNum = tenant.whatsapp?.replace(/\D/g, '') ?? ''
  const whatsappLink = whatsappNum ? `https://wa.me/${whatsappNum}` : '#'

  const specs = (op: OpcionCotizacion) => [
    op.cilindraje    && { icon: SPEC_ICONS.cilindraje,    label: op.cilindraje },
    op.potencia      && { icon: SPEC_ICONS.potencia,      label: op.potencia },
    op.frenos        && { icon: SPEC_ICONS.frenos,        label: op.frenos },
    op.combustible   && { icon: SPEC_ICONS.combustible,   label: op.combustible },
    op.rendimiento   && { icon: SPEC_ICONS.rendimiento,   label: op.rendimiento },
    op.velocidad_max && { icon: SPEC_ICONS.velocidad_max, label: op.velocidad_max },
    op.garantia      && { icon: SPEC_ICONS.garantia,      label: op.garantia },
    op.caracteristica && { icon: SPEC_ICONS.caracteristica, label: op.caracteristica },
  ].filter(Boolean) as { icon: string; label: string }[]

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body { margin: 0 !important; }
          .no-print { display: none !important; }
          .print-root { font-size: 11px; }
        }
        body { margin: 0; background: #f3f4f6; }
        .print-root { font-family: 'Segoe UI', Arial, sans-serif; }
      `}</style>

      {/* Barra de acciones — solo pantalla */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white flex items-center justify-between px-6 py-3 shadow-lg">
        <button onClick={() => window.history.back()} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition-colors">
          ← Volver
        </button>
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

      {/* DOCUMENTO */}
      <div className="print-root no-print:mt-16 min-h-screen bg-gray-100 flex justify-center py-8 px-4 print:p-0 print:bg-white print:mt-0">
        <div style={{ width: '210mm', background: '#fff', boxShadow: '0 4px 40px rgba(0,0,0,0.15)' }}>

          {/* ── HEADER ── */}
          <div style={{ background: 'linear-gradient(135deg, #0035a0 0%, #0052B4 50%, #0066cc 100%)', padding: '28px 36px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              {/* Logo + Nombre */}
              <div>
                {tenant.logo_uri && (
                  <img src={tenant.logo_uri} alt="Logo" style={{ height: 52, objectFit: 'contain', marginBottom: 8, filter: 'brightness(0) invert(1)' }} />
                )}
                <div style={{ color: '#fff', fontSize: 26, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', lineHeight: 1 }}>
                  {tenant.nombre}
                </div>
                {tenant.tagline && (
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginTop: 4 }}>
                    {tenant.tagline}
                  </div>
                )}
              </div>

              {/* Tarjeta de cotización */}
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: '14px 20px', minWidth: 180, border: '1px solid rgba(255,255,255,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ background: '#0052B4', border: '2px solid rgba(255,255,255,0.4)', borderRadius: 6, padding: '4px 6px' }}>
                    <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>No. de Cotización</div>
                    <div style={{ background: '#1a56db', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 800, display: 'inline-block', marginTop: 2 }}>
                      MS-{pad(cotizacion.numero)}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>📅</span>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>Fecha</div>
                    <div style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{formatFecha(cotizacion.fecha_generacion)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>⏰</span>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>Vigencia</div>
                    <div style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{cotizacion.vigencia_dias} días</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Título COTIZACIÓN */}
            <div style={{ marginTop: 18 }}>
              <div style={{ color: '#fff', fontSize: 40, fontWeight: 900, letterSpacing: -1, lineHeight: 1, textTransform: 'uppercase' }}>COTIZACIÓN</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontStyle: 'italic', marginTop: 2 }}>
                Tu próxima <span style={{ fontWeight: 700, color: '#7ec8f0' }}>aventura</span> comienza aquí
              </div>
            </div>
          </div>

          {/* Barra de contacto */}
          <div style={{ background: '#003087', display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {tenant.direccion && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: 14 }}>📍</span>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10 }}>{tenant.direccion}</span>
              </div>
            )}
            {(tenant.telefono1 || tenant.telefono2) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: 14 }}>📞</span>
                <div>
                  {tenant.telefono1 && <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10 }}>{tenant.telefono1}</div>}
                  {tenant.telefono2 && <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10 }}>{tenant.telefono2}</div>}
                </div>
              </div>
            )}
            {(tenant.email || tenant.web) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}>
                <span style={{ fontSize: 14 }}>✉️</span>
                <div>
                  {tenant.email && <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10 }}>{tenant.email}</div>}
                  {tenant.web    && <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 10 }}>{tenant.web}</div>}
                </div>
              </div>
            )}
          </div>

          {/* ── CUERPO ── */}
          <div style={{ padding: '24px 36px' }}>

            {/* Datos del cliente + ¿Por qué elegirnos? */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
              {/* Datos cliente */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>👤</span>
                  <span style={{ fontWeight: 800, fontSize: 12, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1 }}>Datos del cliente</span>
                </div>
                {[
                  ['Nombre', cotizacion.cliente_nombre],
                  ['Celular', cotizacion.cliente_celular],
                  ['Correo', cotizacion.cliente_email],
                ].map(([label, val]) => val ? (
                  <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11 }}>
                    <span style={{ color: '#64748b', minWidth: 52 }}>{label}:</span>
                    <span style={{ borderBottom: '1px solid #cbd5e1', flex: 1, paddingBottom: 2, color: '#1e293b', fontWeight: 500 }}>{val}</span>
                  </div>
                ) : null)}
                {/* Campos vacíos para llenar a mano si se imprime */}
                {!cotizacion.cliente_nombre && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11 }}>
                    <span style={{ color: '#64748b', minWidth: 52 }}>Nombre:</span>
                    <span style={{ borderBottom: '1px solid #cbd5e1', flex: 1 }}>&nbsp;</span>
                  </div>
                )}
                {!cotizacion.cliente_celular && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11 }}>
                    <span style={{ color: '#64748b', minWidth: 52 }}>Celular:</span>
                    <span style={{ borderBottom: '1px solid #cbd5e1', flex: 1 }}>&nbsp;</span>
                  </div>
                )}
              </div>

              {/* ¿Por qué elegirnos? */}
              <div style={{ background: '#f0f7ff', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                  ¿Por qué elegirnos?
                </div>
                {[
                  { icon: '🛡️', title: 'Motos de calidad', desc: 'Marcas reconocidas y alto rendimiento.' },
                  { icon: '🔧', title: 'Taller especializado', desc: 'Mecánicos certificados siempre disponibles.' },
                  { icon: '🤝', title: 'Respaldo y garantía', desc: 'Tu inversión está protegida.' },
                  { icon: '💳', title: 'Financiamiento fácil', desc: 'Con las mejores entidades del país.' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 11, color: '#1e293b' }}>{title}</div>
                      <div style={{ fontSize: 10, color: '#475569' }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── OPCIONES DISPONIBLES ── */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 20 }}>🏍️</span>
                <span style={{ fontWeight: 900, fontSize: 16, color: '#0035a0', textTransform: 'uppercase', letterSpacing: 1 }}>Opciones disponibles</span>
                <div style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, #0052B4, transparent)' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cotizacion.opciones.length, 3)}, 1fr)`, gap: 14 }}>
                {cotizacion.opciones.slice(0, 3).map((op, idx) => {
                  const color = OPTION_COLORS[idx]
                  const sp = specs(op)
                  const foto = op.foto_promo_uri || op.foto_lado_uri || op.foto_frente_uri
                  return (
                    <div key={op.moto_catalogo_id} style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${color}20`, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                      {/* Banner opción */}
                      <div style={{ background: color, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#fff', fontWeight: 800, fontSize: 11, letterSpacing: 2 }}>{OPTION_LABEL[idx]}</span>
                        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '2px 10px' }}>
                          <span style={{ color: '#fff', fontSize: 9, fontWeight: 600 }}>OFERTA ESPECIAL</span>
                        </div>
                      </div>

                      {/* Foto */}
                      <div style={{ background: '#f8fafc', minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                        {foto ? (
                          <img src={foto} alt={op.referencia} style={{ maxHeight: 140, maxWidth: '100%', objectFit: 'contain', display: 'block' }} />
                        ) : (
                          <div style={{ color: '#cbd5e1', fontSize: 11, textAlign: 'center' }}>
                            <div style={{ fontSize: 36, marginBottom: 4 }}>🏍️</div>
                            <div>Foto próximamente</div>
                          </div>
                        )}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: `linear-gradient(transparent, ${color}15)` }} />
                      </div>

                      {/* Nombre + tagline */}
                      <div style={{ padding: '12px 14px 8px' }}>
                        <div style={{ fontWeight: 900, fontSize: 15, color: '#0f172a', letterSpacing: -0.5 }}>{op.referencia}</div>
                        {op.tagline_venta && (
                          <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>{op.tagline_venta}</div>
                        )}
                      </div>

                      {/* Specs */}
                      {sp.length > 0 && (
                        <div style={{ padding: '0 14px 10px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {sp.slice(0, 5).map(s => (
                              <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 600, color: '#334155' }}>
                                <span style={{ fontSize: 11 }}>{s.icon}</span> {s.label}
                              </span>
                            ))}
                          </div>
                          {op.colores && (
                            <div style={{ marginTop: 6, fontSize: 10, color: '#64748b' }}>
                              🎨 Colores: <span style={{ fontWeight: 600 }}>{op.colores}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Precio */}
                      <div style={{ margin: '0 14px 14px', background: color, borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                        {op.mostrar_precio ? (
                          <>
                            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 }}>Precio con documentos</div>
                            <div style={{ color: '#fff', fontSize: 16, fontWeight: 900 }}>{formatCOP(op.precio + op.costo_documentos)}</div>
                          </>
                        ) : (
                          <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Precio a cotizar</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Nota de precios */}
            <p style={{ color: '#94a3b8', fontSize: 9, textAlign: 'center', margin: '8px 0 16px', fontStyle: 'italic' }}>
              * Precios sujetos a cambios sin previo aviso. Aplican términos y condiciones.
            </p>

            {/* ── INCLUYE ── */}
            <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Incluye</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { icon: '🛡️', label: 'Garantía oficial' },
                  { icon: '🔩', label: 'Repuestos disponibles' },
                  { icon: '💰', label: 'Financiamiento opcional' },
                  { icon: '🎓', label: 'Asesoría en matrícula' },
                ].map(({ icon, label }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#166534' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── NOTAS (solo si hay contenido) ── */}
            {cotizacion.notas && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#92400e', marginBottom: 4 }}>📝 Notas adicionales</div>
                <div style={{ fontSize: 11, color: '#78350f', whiteSpace: 'pre-line' }}>{cotizacion.notas}</div>
              </div>
            )}

            {/* ── FRASE CIERRE ── */}
            <div style={{ borderLeft: '4px solid #0052B4', padding: '10px 16px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#0f172a', fontStyle: 'italic', margin: 0 }}>
                &quot;No solo vendemos motos,<br /><strong>acompañamos tu camino.</strong>&quot;
              </p>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div style={{ background: '#003087', padding: '20px 36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 2 }}>¡Hablemos!</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11 }}>Estamos listos para ayudarte a elegir la mejor opción.</div>
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              {tenant.whatsapp && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                  <span style={{ fontSize: 18 }}>📱</span>
                  <div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>WhatsApp</div>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{tenant.whatsapp}</div>
                  </div>
                </div>
              )}
              {tenant.telefono1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                  <span style={{ fontSize: 18 }}>☎️</span>
                  <div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 }}>Llámanos</div>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{tenant.telefono1}</div>
                  </div>
                </div>
              )}
              {tenant.logo_uri && (
                <img src={tenant.logo_uri} alt="Logo" style={{ height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
