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
  costoPapeles: number
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

// ── Clasificación por categoría ──────────────────────────────────────────
// motos_catalogo no tiene columna de categoría propia; se infiere del
// prefijo de la referencia (así se nombran hoy: "TORITO ...", "MAXIMO CARGO
// ..."; todo lo demás es moto). Si algún día se agrega una columna real de
// categoría en la base de datos, reemplazar esta función por ese campo.
type Categoria = 'motos' | 'toritos' | 'maximo'

const CATEGORIA_LABEL: Record<Categoria, string> = {
  motos: 'Motos',
  toritos: 'Toritos',
  maximo: 'Máximo Carga',
}

function categorize(referencia: string): Categoria {
  const r = referencia.trim().toUpperCase()
  if (r.startsWith('TORITO')) return 'toritos'
  if (r.startsWith('MAXIMO') || r.startsWith('MÁXIMO')) return 'maximo'
  return 'motos'
}

// foto | modelo | sin papeles | costo papeles | con papeles | pignorada | tarjeta papeles | tarjeta pignorada
const COLS = '20px 1fr 74px 56px 74px 71px 74px 78px'
const BLACK = '#0f172a'

export default function ListaMotosDoc({ rows, tenant, fecha }: Props) {
  const { nombre, logoUri, tagline, tel1, tel2, email, web, whatsapp, recargo } = tenant

  const grupos = (['motos', 'toritos', 'maximo'] as Categoria[])
    .map(key => ({ key, items: rows.filter(r => categorize(r.referencia) === key) }))
    .filter(g => g.items.length > 0)

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 5mm 8mm; size: letter portrait; }
          body { margin: 0 !important; }
          .no-print { display: none !important; }
          .ld-row, .ld-divider { page-break-inside: avoid; break-inside: avoid; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
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
        <div style={{ width: '200mm', background: '#fff', boxShadow: '0 4px 40px rgba(0,0,0,0.12)' }}>

          {/* ENCABEZADO */}
          <div style={{ background: 'linear-gradient(135deg,#0035a0 0%,#0052B4 60%,#0066cc 100%)', padding: '10px 14px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {logoUri && <img src={logoUri} alt="Logo" style={{ height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />}
              <div>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, textTransform: 'uppercase' }}>{nombre}</div>
                {tagline && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9.5, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 1 }}>{tagline}</div>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fff', fontSize: 18, fontWeight: 900 }}>LISTA DE PRECIOS</div>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 9.5, marginTop: 2 }}>{fecha} · Recargo tarjeta: {recargo}%</div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, marginTop: 1 }}>Precios sujetos a cambios sin previo aviso</div>
            </div>
          </div>

          {/* Barra contacto */}
          {(tel1 || email || web || whatsapp) && (
            <div style={{ background: '#003087', display: 'flex', gap: 14, padding: '5px 14px', flexWrap: 'wrap' }}>
              {tel1     && <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 8.5 }}>📞 {tel1}{tel2 ? ` / ${tel2}` : ''}</span>}
              {email    && <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 8.5 }}>✉️ {email}</span>}
              {web      && <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 8.5 }}>🌐 {web}</span>}
              {whatsapp && <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 8.5 }}>📱 {whatsapp}</span>}
            </div>
          )}

          {/* HEADER COLUMNAS */}
          <div style={{ padding: '7px 10px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 4, padding: '5px 6px', background: '#0052B4', borderRadius: 5, alignItems: 'center' }}>
              <div />
              <div style={{ color: '#fff', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}>Modelo</div>
              {([
                ['Sin papeles',                     'rgba(255,255,255,0.85)'],
                ['Costo papeles',                   'rgba(255,255,255,0.85)'],
                ['Con papeles',                     '#6ee7b7'],
                ['Pignorada',                       '#93c5fd'],
                [`Tarjeta/papeles +${recargo}%`,    '#fcd34d'],
                [`Tarjeta/pignorada +${recargo}%`,  '#fdba74'],
              ] as [string, string][]).map(([label, color]) => (
                <div key={label} style={{ color, fontSize: 8, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.2 }}>{label}</div>
              ))}
            </div>
          </div>

          {/* FILAS — consolidadas, agrupadas por categoría con un divisor liviano */}
          <div style={{ padding: '3px 10px 10px' }}>
            {rows.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>
                Sin motos activas. Ve a Config Ventas para activarlas.
              </div>
            )}

            {grupos.map(g => (
              <div key={g.key}>
                {grupos.length > 1 && (
                  <div className="ld-divider" style={{
                    background: '#e2e8f0', color: '#0f172a', fontSize: 10, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px',
                    marginTop: 4, borderRadius: 3,
                  }}>
                    {CATEGORIA_LABEL[g.key]} <span style={{ color: '#64748b', fontWeight: 600 }}>({g.items.length})</span>
                  </div>
                )}
                {g.items.map((m, idx) => (
                  <div key={m.id} className="ld-row" style={{
                    display: 'grid', gridTemplateColumns: COLS,
                    gap: 4, alignItems: 'center', padding: '2px 6px',
                    background: idx % 2 === 0 ? '#f8fafc' : '#fff',
                    borderBottom: '1px solid #f1f5f9',
                  }}>
                    {/* Foto */}
                    <div style={{ width: 20, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {m.fotoUri
                        ? <img src={m.fotoUri} alt={m.referencia} style={{ maxWidth: 20, maxHeight: 18, objectFit: 'contain' }} />
                        : <span style={{ fontSize: 12 }}>🏍️</span>}
                    </div>

                    {/* Nombre (una sola línea) */}
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: BLACK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.referencia}
                    </div>

                    {/* Precios — todos en negro; negrilla solo en Con papeles / Tarjeta+papeles / Tarjeta+pignorada */}
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 400, color: BLACK }}>{cop(m.sinPapeles)}</div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 400, color: BLACK }}>{cop(m.costoPapeles)}</div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 800, color: BLACK, background: '#f0fdf4', borderRadius: 3, padding: '1.5px 5px' }}>{cop(m.conPapeles)}</div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 400, color: BLACK, background: '#eff6ff', borderRadius: 3, padding: '1.5px 5px' }}>{cop(m.pignorada)}</div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 800, color: BLACK, background: '#fffbeb', borderRadius: 3, padding: '1.5px 5px' }}>{cop(m.tarjetaPapeles)}</div>
                    <div style={{ textAlign: 'right', fontSize: 11, fontWeight: 800, color: BLACK, background: '#fff7ed', borderRadius: 3, padding: '1.5px 5px' }}>{cop(m.tarjetaPignorada)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* PIE */}
          <div style={{ background: '#003087', padding: '9px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 8.5, fontStyle: 'italic', lineHeight: 1.45 }}>
              * Precios con papeles incluyen SOAT, matrícula e impuestos.<br />
              * Pignorada aplica únicamente en compras financiadas a crédito.<br />
              * Recargo del {recargo}% aplica para pagos con tarjeta débito o crédito.
            </div>
            {logoUri && <img src={logoUri} alt="Logo" style={{ height: 20, objectFit: 'contain', filter: 'brightness(0) invert(1)', opacity: 0.75 }} />}
          </div>

        </div>
      </div>
    </>
  )
}
