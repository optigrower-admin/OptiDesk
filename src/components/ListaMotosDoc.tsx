'use client'

function cop(n: number) {
  return n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

export interface MotoFila {
  id: string
  referencia: string
  tagline_venta: string
  cilindraje: string
  potencia: string
  frenos: string
  garantia: string
  colores: string
  fotoUri: string
  sinPapeles: number
  conPapeles: number
  pignorada: number
  tarjetaPapeles: number
  tarjetaPignorada: number
}

export interface TenantInfo {
  nombre: string
  logoUri: string
  tagline: string
  tel1: string
  tel2: string
  email: string
  web: string
  whatsapp: string
  recargo: number
}

interface Props {
  rows: MotoFila[]
  tenant: TenantInfo
  fecha: string
}

export default function ListaMotosDoc({ rows, tenant, fecha }: Props) {
  const { nombre, logoUri, tagline, tel1, tel2, email, web, whatsapp, recargo } = tenant

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 8mm 6mm; size: A4 landscape; }
          body { margin: 0 !important; }
          .no-print { display: none !important; }
        }
        body { margin: 0; background: #f3f4f6; font-family: 'Segoe UI', Arial, sans-serif; }
      `}</style>

      {/* Toolbar — solo pantalla */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white flex items-center justify-between px-6 py-3 shadow-lg">
        <button onClick={() => window.history.back()} className="text-sm text-gray-300 hover:text-white transition-colors">
          ← Volver
        </button>
        <span className="font-bold text-sm">Lista de Motos · {rows.length} modelos activos</span>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimir / PDF
        </button>
      </div>

      <div className="no-print:mt-16 bg-gray-100 min-h-screen flex justify-center py-8 px-2 print:p-0 print:bg-white print:mt-0">
        <div style={{ width: '297mm', background: '#fff', boxShadow: '0 4px 40px rgba(0,0,0,0.12)' }}>

          {/* ENCABEZADO */}
          <div style={{ background: 'linear-gradient(135deg,#0035a0 0%,#0052B4 60%,#0066cc 100%)', padding: '20px 28px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {logoUri && <img src={logoUri} alt="Logo" style={{ height: 40, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />}
              <div>
                <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, textTransform: 'uppercase' }}>{nombre}</div>
                {tagline && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>{tagline}</div>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 900 }}>LISTA DE MOTOS</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10, marginTop: 3 }}>{fecha} · Recargo tarjeta: {recargo}%</div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9, marginTop: 1 }}>Precios sujetos a cambios sin previo aviso</div>
            </div>
          </div>

          {/* Barra contacto */}
          {(tel1 || email || web || whatsapp) && (
            <div style={{ background: '#003087', display: 'flex', gap: 20, padding: '6px 28px', flexWrap: 'wrap' }}>
              {tel1     && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9 }}>📞 {tel1}{tel2 ? ` / ${tel2}` : ''}</span>}
              {email    && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9 }}>✉️ {email}</span>}
              {web      && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9 }}>🌐 {web}</span>}
              {whatsapp && <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 9 }}>📱 {whatsapp}</span>}
            </div>
          )}

          {/* HEADER COLUMNAS */}
          <div style={{ padding: '10px 28px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr 88px 105px 105px 118px 124px', gap: 4, padding: '7px 10px', background: '#0052B4', borderRadius: 8, alignItems: 'center' }}>
              <div />
              <div style={{ color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Modelo</div>
              {([
                ['Sin papeles',                     'rgba(255,255,255,0.8)'],
                ['Con papeles',                     '#6ee7b7'],
                ['Pignorada',                       '#93c5fd'],
                [`Tarjeta / papeles +${recargo}%`,  '#fcd34d'],
                [`Tarjeta / pignorada +${recargo}%`,'#fdba74'],
              ] as [string, string][]).map(([label, color]) => (
                <div key={label} style={{ color, fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.2 }}>{label}</div>
              ))}
            </div>
          </div>

          {/* FILAS */}
          <div style={{ padding: '6px 28px 20px' }}>
            {rows.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>
                Sin motos activas. Ve a Config Ventas para activarlas.
              </div>
            )}
            {rows.map((m, idx) => (
              <div key={m.id} style={{
                display: 'grid', gridTemplateColumns: '56px 1fr 88px 105px 105px 118px 124px',
                gap: 4, alignItems: 'center', padding: '8px 10px',
                background: idx % 2 === 0 ? '#f8fafc' : '#fff',
                borderBottom: '1px solid #f1f5f9', borderRadius: 6, marginTop: 3,
              }}>
                {/* Foto */}
                <div style={{ width: 52, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {m.fotoUri
                    ? <img src={m.fotoUri} alt={m.referencia} style={{ maxWidth: 52, maxHeight: 40, objectFit: 'contain' }} />
                    : <span style={{ fontSize: 22 }}>🏍️</span>}
                </div>

                {/* Info */}
                <div>
                  <div style={{ fontWeight: 800, fontSize: 12, color: '#0f172a' }}>{m.referencia}</div>
                  {m.tagline_venta && <div style={{ fontSize: 9, color: '#64748b', fontStyle: 'italic', marginTop: 1 }}>{m.tagline_venta}</div>}
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {m.cilindraje && <span style={{ fontSize: 8.5, background: '#e2e8f0', color: '#475569', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>⚙️ {m.cilindraje}</span>}
                    {m.potencia   && <span style={{ fontSize: 8.5, background: '#e2e8f0', color: '#475569', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>⚡ {m.potencia}</span>}
                    {m.frenos     && <span style={{ fontSize: 8.5, background: '#e2e8f0', color: '#475569', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>🛡️ {m.frenos}</span>}
                    {m.garantia   && <span style={{ fontSize: 8.5, background: '#dcfce7', color: '#166534', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>✅ {m.garantia}</span>}
                  </div>
                  {m.colores && <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 2 }}>🎨 {m.colores}</div>}
                </div>

                {/* Precios */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#374151' }}>{cop(m.sinPapeles)}</div>
                </div>
                <div style={{ textAlign: 'right', background: '#f0fdf4', borderRadius: 4, padding: '4px 6px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#059669' }}>{cop(m.conPapeles)}</div>
                  <div style={{ fontSize: 7.5, color: '#6b7280', marginTop: 1 }}>SOAT + matrícula</div>
                </div>
                <div style={{ textAlign: 'right', background: '#eff6ff', borderRadius: 4, padding: '4px 6px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8' }}>{cop(m.pignorada)}</div>
                  <div style={{ fontSize: 7.5, color: '#6b7280', marginTop: 1 }}>Crédito pignorado</div>
                </div>
                <div style={{ textAlign: 'right', background: '#fffbeb', borderRadius: 4, padding: '4px 6px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309' }}>{cop(m.tarjetaPapeles)}</div>
                  <div style={{ fontSize: 7.5, color: '#92400e', marginTop: 1 }}>Tarjeta s/ papeles</div>
                </div>
                <div style={{ textAlign: 'right', background: '#fff7ed', borderRadius: 4, padding: '4px 6px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#c2410c' }}>{cop(m.tarjetaPignorada)}</div>
                  <div style={{ fontSize: 7.5, color: '#9a3412', marginTop: 1 }}>Tarjeta s/ pignorada</div>
                </div>
              </div>
            ))}
          </div>

          {/* PIE */}
          <div style={{ background: '#003087', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 9, fontStyle: 'italic', lineHeight: 1.5 }}>
              * Precios con papeles incluyen SOAT, matrícula e impuestos.<br />
              * Pignorada aplica únicamente en compras financiadas a crédito.<br />
              * Recargo del {recargo}% aplica para pagos con tarjeta débito o crédito.
            </div>
            {logoUri && <img src={logoUri} alt="Logo" style={{ height: 26, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.75 }} />}
          </div>

        </div>
      </div>
    </>
  )
}
