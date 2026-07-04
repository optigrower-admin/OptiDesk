'use client'
import { useEffect } from 'react'

function cop(n: number) {
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}
function pad(n: number) { return String(n).padStart(4, '0') }
function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtPhone(p: string): string {
  const d = (p ?? '').replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p ?? ''
}

export type ItemServTec = {
  id: string
  tipo: 'repuesto_uma' | 'repuesto_externo' | 'mano_obra'
  referencia: string | null
  descripcion: string
  cantidad: number
  precio_proveedor: number | null
  precio_venta: number
  orden: number
}

export type CotizacionServTec = {
  id: string
  numero: number
  fecha_generacion: string
  vigencia_dias: number
  cliente_nombre: string | null
  cliente_celular: string | null
  cliente_email: string | null
  notas: string | null
  items: ItemServTec[]
}

export type TenantInfoST = {
  nombre: string
  logo_uri: string
  tagline: string
  direccion: string
  telefono1: string
  email: string
  web: string
  whatsapp: string
}

interface Props {
  cotizacion: CotizacionServTec
  tenant: TenantInfoST
}

export default function CotizacionServTecDoc({ cotizacion, tenant }: Props) {
  const whatsappNum  = tenant.whatsapp?.replace(/\D/g, '') ?? ''
  const whatsappLink = whatsappNum ? `https://wa.me/${whatsappNum}` : '#'

  const repUma     = cotizacion.items.filter(i => i.tipo === 'repuesto_uma')
  const repExt     = cotizacion.items.filter(i => i.tipo === 'repuesto_externo')
  const manoObra   = cotizacion.items.filter(i => i.tipo === 'mano_obra')

  const totalUmaVenta  = repUma.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalExtVenta  = repExt.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalExtCosto  = repExt.reduce((s, i) => s + (i.precio_proveedor ?? 0) * i.cantidad, 0)
  const totalMO        = manoObra.reduce((s, i) => s + i.precio_venta * i.cantidad, 0)
  const totalVenta     = totalUmaVenta + totalExtVenta + totalMO

  useEffect(() => {
    const prev = document.title
    document.title = `CotST-${pad(cotizacion.numero)}`
    return () => { document.title = prev }
  }, [cotizacion.numero])

  return (
    <>
      <style>{`
        @page { margin: 0; size: 8.5in 11in portrait; }
        .cot-st { width: 216mm; }
        @media print {
          body  { margin: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .cot-st { zoom: 0.82; width: 263mm; box-shadow: none !important; }
          .page-break { page-break-before: always; }
        }
        body { margin: 0; background: #e5e7eb; }
        * { box-sizing: border-box; }
      `}</style>

      {/* TOOLBAR */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white flex items-center justify-between px-6 py-3 shadow-lg">
        <button onClick={() => window.history.back()} className="text-sm text-gray-300 hover:text-white">← Volver</button>
        <span className="font-semibold text-sm">Cotización ST-{pad(cotizacion.numero)}</span>
        <div className="flex gap-3">
          {whatsappNum && (
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-sm font-semibold px-4 py-2 rounded-lg">
              WhatsApp
            </a>
          )}
          <button onClick={() => window.print()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-sm font-semibold px-4 py-2 rounded-lg">
            🖨️ Imprimir / PDF
          </button>
        </div>
      </div>

      {/* DOCUMENTO */}
      <div className="no-print:mt-16 min-h-screen flex justify-center py-8 px-4 print:p-0 print:mt-0" style={{ background: '#e5e7eb' }}>
        <div className="cot-st" style={{ background: '#fff', boxShadow: '0 8px 60px rgba(0,0,0,0.2)', fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 13 }}>

          {/* ══ HEADER ══ */}
          <div style={{ background: 'linear-gradient(135deg, #e0eeff 0%, #dbeafe 45%, #eff6ff 100%)', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'stretch', borderBottom: '2px solid #93c5fd' }}>

            {/* Izquierda */}
            <div style={{ padding: '14px 20px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
              {tenant.logo_uri
                ? <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 64, objectFit: 'contain', objectPosition: 'left', display: 'block' }} />
                : <div style={{ color: '#1e3a8a', fontSize: 20, fontWeight: 900, textTransform: 'uppercase' }}>{tenant.nombre}</div>
              }
              {tenant.tagline && (
                <div style={{ color: '#64748b', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>{tenant.tagline}</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 8, borderTop: '1px solid #93c5fd', marginTop: 'auto' }}>
                {[
                  { icon: '📍', text: tenant.direccion },
                  { icon: '📞', text: tenant.telefono1 },
                  { icon: '✉️', text: tenant.email },
                  { icon: '🌐', text: tenant.web },
                ].filter(c => c.text).map(c => (
                  <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12 }}>{c.icon}</span>
                    <span style={{ fontSize: 11, color: '#1d4ed8' }}>{c.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Derecha: número */}
            <div style={{ borderLeft: '1px solid #93c5fd', padding: '14px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 6, minWidth: 160 }}>
              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 }}>Cotización S.T.</div>
              <div style={{ color: '#1e3a8a', fontWeight: 900, fontSize: 22, letterSpacing: 0.5, lineHeight: 1 }}>ST-{pad(cotizacion.numero)}</div>
              <div style={{ color: '#1d4ed8', fontSize: 13 }}>📅 {formatFecha(cotizacion.fecha_generacion)}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>⏰ Válida {cotizacion.vigencia_dias} días</div>
            </div>
          </div>

          {/* ══ DATOS DEL CLIENTE ══ */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #e8edf5', background: '#f8faff' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Datos del cliente
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 16px' }}>
              {[
                ['Nombre', cotizacion.cliente_nombre],
                ['Celular', cotizacion.cliente_celular ? fmtPhone(cotizacion.cliente_celular) : null],
                ['Correo', cotizacion.cliente_email],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>{label}:</span>
                  <span style={{ flex: 1, borderBottom: '1px solid #b8c4d8', paddingBottom: 1, fontSize: 11, color: val ? '#1a1a2e' : 'transparent', fontWeight: val ? 600 : 400 }}>{val ?? ' '}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ══ TABLA DE ITEMS ══ */}
          <div style={{ padding: '12px 20px' }}>

            {/* Columnas compartidas para tablas con referencia */}
            {[
              { label: '🔧 Repuestos UMA', items: repUma, color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', conRef: true },
              { label: '📦 Repuestos Externos', items: repExt, color: '#92400e', bg: '#fffbeb', border: '#fde68a', conRef: false },
            ].filter(g => g.items.length > 0).map(g => (
              <div key={g.label} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: g.color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingBottom: 4, borderBottom: `2px solid ${g.color}` }}>
                  {g.label}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: g.bg }}>
                      {g.conRef && <th style={{ padding: '5px 8px', textAlign: 'left', color: g.color, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: `1px solid ${g.border}`, width: 90 }}>Referencia</th>}
                      <th style={{ padding: '5px 8px', textAlign: 'left', color: g.color, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: `1px solid ${g.border}` }}>Descripción</th>
                      <th style={{ padding: '5px 8px', textAlign: 'center', color: g.color, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: `1px solid ${g.border}`, width: 50 }}>Cant.</th>
                      <th style={{ padding: '5px 8px', textAlign: 'right', color: g.color, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: `1px solid ${g.border}`, width: 90 }}>P. Unit.</th>
                      <th style={{ padding: '5px 8px', textAlign: 'right', color: g.color, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: `1px solid ${g.border}`, width: 90 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((item, i) => (
                      <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : g.bg }}>
                        {g.conRef && <td style={{ padding: '5px 8px', color: '#475569', fontFamily: 'monospace', fontSize: 10 }}>{item.referencia ?? '—'}</td>}
                        <td style={{ padding: '5px 8px', color: '#1e293b' }}>{item.descripcion}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center', color: '#1e293b', fontWeight: 600 }}>{item.cantidad}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#1e293b' }}>{cop(item.precio_venta)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#1e293b', fontWeight: 700 }}>{cop(item.precio_venta * item.cantidad)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: g.bg, borderTop: `1.5px solid ${g.border}` }}>
                      <td colSpan={g.conRef ? 4 : 3} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: g.color, fontSize: 10, textTransform: 'uppercase' }}>
                        Subtotal {g.label.replace(/^..\s/, '')}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a', fontSize: 12 }}>
                        {cop(g.items.reduce((s, i) => s + i.precio_venta * i.cantidad, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}

            {/* Mano de obra */}
            {manoObra.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid #6d28d9' }}>
                  🛠️ Mano de Obra
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#f5f3ff' }}>
                      <th style={{ padding: '5px 8px', textAlign: 'left', color: '#6d28d9', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #ddd6fe' }}>Descripción</th>
                      <th style={{ padding: '5px 8px', textAlign: 'center', color: '#6d28d9', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #ddd6fe', width: 50 }}>Cant.</th>
                      <th style={{ padding: '5px 8px', textAlign: 'right', color: '#6d28d9', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #ddd6fe', width: 90 }}>P. Unit.</th>
                      <th style={{ padding: '5px 8px', textAlign: 'right', color: '#6d28d9', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #ddd6fe', width: 90 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manoObra.map((item, i) => (
                      <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f5f3ff' }}>
                        <td style={{ padding: '5px 8px', color: '#1e293b' }}>{item.descripcion}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center', color: '#1e293b', fontWeight: 600 }}>{item.cantidad}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#1e293b' }}>{cop(item.precio_venta)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#1e293b', fontWeight: 700 }}>{cop(item.precio_venta * item.cantidad)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#f5f3ff', borderTop: '1.5px solid #ddd6fe' }}>
                      <td colSpan={3} style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#6d28d9', fontSize: 10, textTransform: 'uppercase' }}>Subtotal mano de obra</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a', fontSize: 12 }}>{cop(totalMO)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* TOTAL FINAL desglosado */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ background: '#eff6ff', border: '2px solid #0052B4', borderRadius: 10, padding: '10px 16px', minWidth: 260 }}>
                {totalUmaVenta > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: '#64748b' }}>Repuestos UMA</span>
                    <span style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>{cop(totalUmaVenta)}</span>
                  </div>
                )}
                {totalExtVenta > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
                      <span style={{ fontSize: 10, color: '#64748b' }}>Repuestos externos (venta)</span>
                      <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>{cop(totalExtVenta)}</span>
                    </div>
                    {totalExtCosto > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>— costo proveedor ext.</span>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>{cop(totalExtCosto)}</span>
                      </div>
                    )}
                  </div>
                )}
                {totalMO > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: '#64748b' }}>Mano de obra</span>
                    <span style={{ fontSize: 11, color: '#6d28d9', fontWeight: 600 }}>{cop(totalMO)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, borderTop: '1.5px solid #bfdbfe', paddingTop: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total a cobrar</span>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#1e3a8a' }}>{cop(totalVenta)}</span>
                </div>
              </div>
            </div>

            {/* Notas */}
            {cotizacion.notas && (
              <div style={{ marginTop: 14, padding: '8px 11px', background: '#eff6ff', borderRadius: 8, border: '1px dashed #93c5fd' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>📝 Notas</div>
                <div style={{ fontSize: 11, color: '#1e3a8a', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{cotizacion.notas}</div>
              </div>
            )}
          </div>

          {/* ══ FOOTER ══ */}
          <div style={{ background: 'linear-gradient(135deg, #e0eeff 0%, #dbeafe 50%, #eff6ff 100%)', borderTop: '2px solid #93c5fd', padding: '10px 24px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 1 }}>Servicio Técnico</div>
              <div style={{ color: '#1e3a8a', fontSize: 15, fontWeight: 900, letterSpacing: -0.5, textTransform: 'uppercase', lineHeight: 1 }}>& Repuestos</div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                Precios sujetos a cambio · Vigencia: {cotizacion.vigencia_dias} días
              </div>
            </div>
            <div style={{ textAlign: 'center', maxWidth: 150 }}>
              <div style={{ fontSize: 11, color: '#1d4ed8', lineHeight: 1.5, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                En {tenant.nombre || 'nuestro taller'}<br/>nos apasiona cada reparación.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {tenant.logo_uri && (
                <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 26, objectFit: 'contain' }} />
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
