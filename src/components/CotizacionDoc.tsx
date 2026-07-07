'use client'
import { useEffect } from 'react'
import type { OpcionCotizacion, ColorVarianteCot } from '@/app/admin/cotizaciones/[id]/page'

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
  if (d.length === 7)  return `${d.slice(0,3)}-${d.slice(3)}`
  return p ?? ''
}
/* Extrae emoji inicial de un texto: "🛡️ SOAT" → {icon:'🛡️', text:'SOAT'} */
function parseIcono(raw: string, fallback = '•'): { icon: string; text: string } {
  const m = raw.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u)
  if (m) return { icon: m[1], text: raw.slice(m[0].length) }
  return { icon: fallback, text: raw }
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="12" fill={color}/>
      <path d="M7 12.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IcoWA({ s = 13, color = '#25D366' }: { s?: number; color?: string }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
}
function IcoIG({ s = 13, color }: { s?: number; color?: string }) {
  const fill = color ?? 'url(#ig)'
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      {!color && <defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#f09433"/><stop offset="25%" stopColor="#e6683c"/><stop offset="50%" stopColor="#dc2743"/><stop offset="75%" stopColor="#cc2366"/><stop offset="100%" stopColor="#bc1888"/></linearGradient></defs>}
      <path fill={fill} d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}
function IcoFB({ s = 13, color = '#1877F2' }: { s?: number; color?: string }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
}
function IcoTK({ s = 13, color = 'white' }: { s?: number; color?: string }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.67a8.16 8.16 0 004.77 1.51V6.68a4.85 4.85 0 01-1-.01z"/></svg>
}

const DEFAULT_INCLUYE = [
  '🛡️ SOAT obligatorio',
  '📋 Matrícula + impuestos',
  '📖 Manual del propietario',
  '🏭 Garantía de fábrica',
  '🔧 3 revisiones mano de obra gratis',
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

  /* Foto promocional (sidebar derecho): promo > extra > frente > lado */
  const fotoPromoSidebar = fotoPromo || fotoExtra || fotoFrente || fotoLado

  const base       = op?.precio ?? 0
  const docs       = op?.costo_documentos ?? 0
  const prenda     = op?.costo_prenda ?? 0
  const conPapeles = base + docs
  const pignorada  = base + docs + prenda
  const verContado   = op?.mostrar_contado  ?? op?.mostrar_precio ?? false
  const verPignorada = op?.mostrar_pignorada ?? false

  /* Especificaciones con icono configurable: si el valor empieza con emoji lo usa,
     si no usa el icono predeterminado del campo */
  const specsItems = op ? [
    op.cilindraje    && parseIcono(`Motor ${op.cilindraje}`,   '⚙️'),
    op.potencia      && parseIcono(op.potencia,                '⚡'),
    op.frenos        && parseIcono(op.frenos,                  '🛡️'),
    op.combustible   && parseIcono(op.combustible,             '⛽'),
    op.rendimiento   && parseIcono(op.rendimiento,             '📊'),
    op.velocidad_max && parseIcono(`Vel. máx. ${op.velocidad_max}`, '🏎️'),
    op.garantia      && parseIcono(op.garantia,                '✅'),
    op.caracteristica && parseIcono(op.caracteristica,         '✨'),
  ].filter(Boolean) as { icon: string; text: string }[] : []

  const specsCheck = specsItems.map(s => s.text) // retrocompat para otros usos

  const specsChips = op ? [
    op.cilindraje    && { icon: '⚙️', label: op.cilindraje },
    op.frenos        && { icon: '🛡️', label: op.frenos },
    op.garantia      && { icon: '✅', label: op.garantia },
    op.caracteristica && { icon: '✨', label: op.caracteristica },
  ].filter(Boolean).slice(0, 4) as { icon: string; label: string }[] : []

  /* Prioridad: moto → tenant → predeterminados del sistema */
  const incluyeItems: string[] = (() => {
    const src = op?.cotizacion_incluye?.trim() || tenant.incluye?.trim() || ''
    return src ? src.split('\n').map(l => l.trim()).filter(Boolean) : DEFAULT_INCLUYE
  })()

  const beneficios = (() => {
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

  /* Fotos del cuerpo: extra (principal sin título), frente + lado (con título) */
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
        /* Tamaño carta: 8.5in × 11in = 216mm × 279mm */
        @page { margin: 0; size: 8.5in 11in portrait; }

        /* Pantalla */
        .cot-doc { width: 216mm; }
        @media print {
          body  { margin: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .cot-doc {
            zoom: 0.70;
            width: 309mm; /* 216/0.70 → visual = 216mm = ancho carta */
            box-shadow: none !important;
          }
        }
        body { margin: 0; background: #e5e7eb; }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── TOOLBAR ── */}
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
        <div className="cot-doc" style={{ background: '#fff', boxShadow: '0 8px 60px rgba(0,0,0,0.2)', fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 12 }}>

          {/* ══ HEADER: azul muy suave / transparentoso, sin tinta pesada ══ */}
          <div style={{ background: 'linear-gradient(135deg, #e0eeff 0%, #dbeafe 45%, #eff6ff 100%)', display: 'grid', gridTemplateColumns: '1fr 185px', alignItems: 'stretch', borderBottom: '2px solid #93c5fd' }}>

            {/* Izquierda: Logo + tagline + barra de contacto */}
            <div style={{ padding: '14px 20px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
              {tenant.logo_uri
                ? <img src={tenant.logo_uri} alt={tenant.nombre} style={{ height: 72, objectFit: 'contain', objectPosition: 'left', display: 'block' }} />
                : <div style={{ color: '#1e3a8a', fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: -0.5 }}>{tenant.nombre}</div>
              }
              {tenant.tagline && (
                <div style={{ color: '#64748b', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', marginTop: -2 }}>{tenant.tagline}</div>
              )}
              {/* Barra inferior de contacto del header */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 8, borderTop: '1px solid #93c5fd', marginTop: 'auto' }}>
                {[
                  { icon: '📍', text: tenant.direccion },
                  { icon: '📞', text: [tenant.telefono1, tenant.telefono2].filter(Boolean).join(' · ') },
                  { icon: '✉️', text: tenant.email },
                  { icon: '🌐', text: tenant.web },
                ].filter(c => c.text).map(c => (
                  <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 13 }}>{c.icon}</span>
                    <span style={{ fontSize: 11.5, color: '#1d4ed8' }}>{c.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Derecha: número de cotización */}
            <div style={{ borderLeft: '1px solid #93c5fd', padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 6 }}>
              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 2 }}>Cotización</div>
              <div style={{ color: '#1e3a8a', fontWeight: 900, fontSize: 22, letterSpacing: 0.5, lineHeight: 1 }}>MS-{pad(cotizacion.numero)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                <div style={{ color: '#1d4ed8', fontSize: 13.5 }}>📅 {formatFecha(cotizacion.fecha_generacion)}</div>
                <div style={{ color: '#64748b', fontSize: 13 }}>⏰ Válida {cotizacion.vigencia_dias} días</div>
              </div>
            </div>
          </div>

          {/* ══ CUERPO: 2 columnas ══ */}
          <div style={{ display: 'grid', gridTemplateColumns: '64% 36%', alignItems: 'start' }}>

            {/* ─── COLUMNA IZQUIERDA ─── */}
            <div style={{ padding: '13px 16px 12px', borderRight: '1px solid #e8edf5' }}>

              {/* DATOS DEL CLIENTE — solo 3 campos */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <svg width="12" height="12" fill="#0052B4" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1 }}>Datos del cliente</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[
                    ['Empresa / Nombre',   cotizacion.cliente_nombre],
                    ['Teléfono',           cotizacion.cliente_celular],
                    ['Correo electrónico', cotizacion.cliente_email],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 10, color: '#64748b', minWidth: 72, flexShrink: 0 }}>{label}:</span>
                      <span style={{ flex: 1, borderBottom: '1px solid #b8c4d8', paddingBottom: 1, fontSize: 10, color: val ? '#1a1a2e' : 'transparent', fontWeight: val ? 600 : 400 }}>{val ?? ' '}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 7, padding: '5px 9px', borderLeft: '3px solid #0052B4', background: '#f0f5ff', borderRadius: '0 6px 6px 0' }}>
                  <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 13.5, color: '#0052B4', lineHeight: 1.4 }}>
                    <strong>Cuéntanos lo que necesitas</strong> y te ayudamos a encontrar la opción perfecta.
                  </div>
                </div>
              </div>

              {/* NOMBRE + CHIPS */}
              {op && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 24, color: '#001a5e', letterSpacing: -0.5, lineHeight: 1.1 }}>{op.referencia}</div>
                  {op.tagline_venta && <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>{op.tagline_venta}</div>}
                  {specsChips.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {specsChips.map(s => (
                        <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 20, padding: '2px 8px', fontSize: 12.5, fontWeight: 700, color: '#1e40af' }}>
                          <span style={{ fontSize: 11 }}>{s.icon}</span> {s.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* FOTOS DEL PRODUCTO — todas del mismo tamaño en grid uniforme */}
              {op && fotoPrincipal && (() => {
                const allPhotos = [
                  { src: fotoPrincipal.src, label: '' },
                  ...fotosSecundarias,
                ]
                const cols = Math.min(allPhotos.length, 3)
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 7, marginBottom: 11 }}>
                    {allPhotos.map((f, i) => (
                      <div key={i} style={{ background: 'linear-gradient(135deg, #f0f5ff, #e8f0fe)', borderRadius: 9, padding: 7, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 165 }}>
                        <img src={f.src} alt={f.label || op.referencia} style={{ width: '100%', height: 155, objectFit: 'contain', filter: 'drop-shadow(0 3px 8px rgba(0,52,180,0.12))' }} />
                        {f.label && <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textAlign: 'center' }}>{f.label}</div>}
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* COLORES — tarjetas visuales con foto */}
              {(() => {
                const det: ColorVarianteCot[] = op?.colores_detalle ?? []
                const hasNew = det.length > 0
                const hasOld = !!(op?.colores?.trim())
                if (!hasNew && !hasOld) return null
                const numCols = hasNew ? Math.min(det.length, 3) : 0
                return (
                  <div style={{ marginBottom: 10, background: '#eef2f7', borderRadius: 8, padding: '7px 10px', border: '1.5px solid #c8d6e5' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#2d4a6b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>🎨 Colores disponibles</div>
                    {hasNew ? (
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numCols}, 1fr)`, gap: 5 }}>
                        {det.map((c, i) => (
                          <div key={i} style={{ background: '#fff', borderRadius: 7, overflow: 'hidden', border: '1.5px solid #c8d6e5' }}>
                            <div style={{ background: 'linear-gradient(135deg, #f0f5ff, #e8f0fe)', height: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                              {c.imagen_uri ? (
                                <img src={c.imagen_uri} alt={c.nombre} style={{ maxWidth: '100%', maxHeight: 85, objectFit: 'contain', filter: 'drop-shadow(0 1px 4px rgba(0,52,180,0.12))' }} />
                              ) : (
                                <span style={{ fontSize: 22 }}>🎨</span>
                              )}
                            </div>
                            <div style={{ padding: '4px 5px', textAlign: 'center' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#2d4a6b', lineHeight: 1.2, marginBottom: 2 }}>{c.nombre}</div>
                              {c.dias_entrega ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#dbeafe', borderRadius: 20, padding: '1px 6px' }}>
                                  <span style={{ fontSize: 8.5 }}>📦</span>
                                  <span style={{ fontSize: 8.5, fontWeight: 700, color: '#1d4ed8' }}>{c.dias_entrega} días</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {op!.colores!.split(/[,;\/]/).map(c => c.trim()).filter(Boolean).map(color => (
                          <span key={color} style={{ background: '#dce6f0', border: '1.5px solid #9ab5cc', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: '#2d4a6b' }}>
                            {color}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* INCLUYE — iconos, colores azul de marca */}
              <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 11px', marginBottom: 10, border: '1.5px solid #bfdbfe' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 7 }}>Esta cotización incluye</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 8px' }}>
                  {incluyeItems.map(item => {
                    const { icon, text } = parseIcono(item, '📌')
                    return (
                      <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13.5, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
                        <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>{text}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ESPECIFICACIONES TÉCNICAS — iconos por tipo de campo */}
              {specsItems.length > 0 && (
                <div style={{ marginBottom: 10, background: '#f8faff', borderRadius: 8, padding: '8px 11px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7, paddingBottom: 4, borderBottom: '1.5px solid #dde3f0' }}>
                    Especificaciones técnicas
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 10px' }}>
                    {specsItems.map(({ icon, text }) => (
                      <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13.5, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
                        <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NOTAS */}
              <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 11px', border: '1px dashed #93c5fd' }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>📝 Notas adicionales</div>
                {cotizacion.notas
                  ? <div style={{ fontSize: 10, color: '#1e3a8a', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{cotizacion.notas}</div>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{['', '', ''].map((_, i) => <div key={i} style={{ borderBottom: '1px solid #93c5fd', height: 13 }} />)}</div>
                }
              </div>
            </div>

            {/* ─── COLUMNA DERECHA ─── */}
            <div style={{ padding: '13px 12px', background: '#f8faff', display: 'flex', flexDirection: 'column', gap: 9 }}>

              {/* FOTO PROMOCIONAL — alta, sin recorte, con fondo */}
              {fotoPromoSidebar && (
                <div style={{ borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(135deg, #f0f5ff, #e8f0fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 210 }}>
                  <img
                    src={fotoPromoSidebar}
                    alt={op?.referencia ?? ''}
                    style={{ width: '100%', maxHeight: 210, objectFit: 'contain', display: 'block', padding: 6, filter: 'drop-shadow(0 4px 14px rgba(0,52,180,0.12))' }}
                  />
                </div>
              )}

              {/* PRECIO — fondo azul suave con borde */}
              {(verContado || verPignorada) && (
                <div style={{ background: '#eff6ff', border: '2px solid #0052B4', borderRadius: 10, padding: '11px 13px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 9, borderBottom: '1.5px solid #bfdbfe', paddingBottom: 5 }}>
                    Precio
                  </div>
                  {verContado && (
                    <div style={{ marginBottom: verPignorada ? 9 : 0 }}>
                      <div style={{ fontSize: 10, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Contado con papeles</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#1e3a8a', lineHeight: 1, letterSpacing: -0.5 }}>{cop(conPapeles)}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>IVA incluido · SOAT · Matrícula</div>
                    </div>
                  )}
                  {verPignorada && (
                    <div style={{ borderTop: verContado ? '1.5px solid #bfdbfe' : 'none', paddingTop: verContado ? 9 : 0 }}>
                      <div style={{ fontSize: 10, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>En crédito (pignorada)</div>
                      <div style={{ fontSize: verContado ? 18 : 23, fontWeight: 900, color: '#0052B4', lineHeight: 1 }}>{cop(pignorada)}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>Incluye prenda · Con papeles</div>
                    </div>
                  )}
                </div>
              )}

              {/* RAZONES */}
              <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 10, padding: '10px 11px' }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, borderBottom: '2px solid #0052B4', paddingBottom: 4 }}>
                  ¿Por qué es la decisión correcta?
                </div>
                {beneficios.map(({ icon, bg, title, desc }) => (
                  <div key={title} style={{ display: 'flex', gap: 7, marginBottom: 7, alignItems: 'flex-start' }}>
                    <div style={{ background: bg, borderRadius: 6, width: 25, height: 25, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, flexShrink: 0 }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 10, color: '#001a5e' }}>{title}</div>
                      <div style={{ fontSize: 11.5, color: '#475569', marginTop: 1, lineHeight: 1.3 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA + CONTACTO INTEGRADO */}
              {(() => {
                const waD = tenant.whatsapp?.startsWith('57') ? tenant.whatsapp.slice(2) : tenant.whatsapp ?? ''
                const igL = tenant.instagram ? `https://instagram.com/${tenant.instagram.replace('@','')}` : '#'
                const fbL = tenant.facebook  ? `https://facebook.com/${tenant.facebook.replace(/^[/@]/,'')}` : '#'
                const tkL = tenant.tiktok    ? `https://tiktok.com/@${tenant.tiktok.replace('@','')}` : '#'
                return (
                <div style={{ background: '#eff6ff', border: '2px solid #0052B4', borderRadius: 10, padding: '13px 12px' }}>

                  {/* Título */}
                  <div style={{ textAlign: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 13.5, color: '#1e3a8a', letterSpacing: -0.3 }}>¡APARTA HOY!</div>
                    <div style={{ fontSize: 11.5, color: '#1d4ed8', marginTop: 3, lineHeight: 1.4 }}>
                      No pierdas esta oportunidad.
                    </div>
                  </div>

                  {/* Título contacto */}
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0052B4', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 7 }}>
                    Contacto {tenant.nombre || ''}
                  </div>

                  {/* WhatsApp — protagonista */}
                  {tenant.whatsapp ? (
                    <a href={whatsappLink} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#128C7E', borderRadius: 9, padding: '10px 12px', marginBottom: 8, textDecoration: 'none', zoom: 1 }}>
                      <IcoWA s={28} color="white" />
                      <div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1 }}>WhatsApp</div>
                        <div style={{ fontWeight: 900, fontSize: 12, color: '#fff', letterSpacing: -0.3 }}>{fmtPhone(waD)}</div>
                      </div>
                    </a>
                  ) : null}

                  {/* Redes sociales — colores de marca, texto blanco = máximo contraste */}
                  {(tenant.instagram || tenant.facebook || tenant.tiktok) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, zoom: 1 }}>
                      {([
                        tenant.instagram && { href: igL, ico: <IcoIG s={24} color="white"/>, label: 'Instagram', handle: tenant.instagram, bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' },
                        tenant.facebook  && { href: fbL, ico: <IcoFB s={24} color="white"/>, label: 'Facebook',  handle: tenant.facebook,  bg: '#1877f2' },
                        tenant.tiktok    && { href: tkL, ico: <IcoTK s={24} color="white"/>, label: 'TikTok',    handle: tenant.tiktok,    bg: '#010101' },
                      ].filter(Boolean) as { href:string; ico:React.ReactNode; label:string; handle:string; bg:string }[]).map(n => (
                        <a key={n.label} href={n.href}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, background: n.bg, borderRadius: 9, padding: '9px 12px', textDecoration: 'none', minHeight: 46 }}>
                          {n.ico}
                          <div>
                            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{n.label}</div>
                            <div style={{ fontSize: 13.5, color: '#fff', fontWeight: 800 }}>{n.handle}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Datos de contacto */}
                  {(tenant.telefono1 || tenant.email || tenant.web || tenant.direccion) && (
                    <div style={{ borderTop: '1.5px solid #bfdbfe', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                      {tenant.telefono1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                          <span style={{ fontSize: 13.5, color: '#1e3a8a', fontWeight: 700 }}>{fmtPhone(tenant.telefono1)}{tenant.telefono2 ? `  ·  ${fmtPhone(tenant.telefono2)}` : ''}</span>
                        </div>
                      )}
                      {tenant.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          <span style={{ fontSize: 13.5, color: '#1e3a8a', fontWeight: 700 }}>{tenant.email}</span>
                        </div>
                      )}
                      {tenant.web && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                          <span style={{ fontSize: 13.5, color: '#1e3a8a', fontWeight: 700 }}>{tenant.web}</span>
                        </div>
                      )}
                      {tenant.direccion && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          <span style={{ fontSize: 13.5, color: '#1e3a8a', fontWeight: 700 }}>{tenant.direccion}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!tenant.whatsapp && !tenant.instagram && !tenant.facebook && !tenant.tiktok && !tenant.telefono1 && !tenant.email && !tenant.direccion && (
                    <div style={{ fontSize: 11.5, color: '#64748b', fontStyle: 'italic', marginBottom: 8 }}>
                      Completa tus datos en Config. Ventas.
                    </div>
                  )}

                  <div style={{ borderTop: '1.5px solid #bfdbfe', paddingTop: 9, textAlign: 'center', fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#1e3a8a', fontSize: 11, lineHeight: 1.5 }}>
                    ¡Más que motos,<br/><strong>creamos experiencias!</strong>
                  </div>
                </div>
                )
              })()}

              {/* BADGES — editables por vehículo */}
              {(() => {
                const DEFAULT_BADGES = [
                  { icon: '🛡️', t: 'GARANTÍA', s: '12 MESES*' },
                  { icon: '⭐', t: 'CALIDAD',   s: 'CERTIFICADA' },
                  { icon: '👍', t: 'CLIENTES',  s: 'SATISFECHOS' },
                ]
                const badges = op?.cotizacion_badges?.trim()
                  ? op.cotizacion_badges.split('\n').slice(0, 3).map(line => {
                      const [icon = '⭐', t = '', s = ''] = line.split('|')
                      return { icon: icon.trim(), t: t.trim(), s: s.trim() }
                    })
                  : DEFAULT_BADGES
                return (
                  <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, textAlign: 'center' }}>
                      {badges.map(b => (
                        <div key={b.t}>
                          <div style={{ fontSize: 17, marginBottom: 3 }}>{b.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#0052B4', lineHeight: 1.2 }}>{b.t}</div>
                          <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600 }}>{b.s}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* TESTIMONIAL — editable por vehículo */}
              {(() => {
                const raw = op?.cotizacion_testimonial?.trim() || ''
                const sepIdx = raw.lastIndexOf('|')
                const texto  = sepIdx > 0 ? raw.slice(0, sepIdx).trim()  : (raw || 'Excelente atención. Me asesoraron perfectamente y la entrega fue rápida y sin complicaciones.')
                const autor  = sepIdx > 0 ? raw.slice(sepIdx + 1).trim() : 'Cliente satisfecho'
                const inicial = (autor?.[0] ?? 'C').toUpperCase()
                return (
                  <div style={{ background: '#fff', border: '1.5px solid #dde3f0', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 13, color: '#0052B4', fontFamily: 'Georgia, serif', lineHeight: 1, marginBottom: 4 }}>&ldquo;</div>
                    <div style={{ fontSize: 11.5, color: '#334155', fontStyle: 'italic', lineHeight: 1.5 }}>{texto}</div>
                    <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 19, height: 19, borderRadius: '50%', background: '#0052B4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{inicial}</div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>{autor}</div>
                        <div style={{ fontSize: 12.5, color: '#f59e0b', lineHeight: 1 }}>⭐⭐⭐⭐⭐</div>
                      </div>
                    </div>
                  </div>
                )
              })()}

            </div>
          </div>

          {/* ══ FOOTER — azul suave para no gastar tinta ══ */}
          <div style={{ background: 'linear-gradient(135deg, #e0eeff 0%, #dbeafe 50%, #eff6ff 100%)', borderTop: '2px solid #93c5fd', padding: '10px 24px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 1 }}>Tu próxima aventura</div>
              <div style={{ color: '#1e3a8a', fontSize: 16, fontWeight: 900, letterSpacing: -0.5, textTransform: 'uppercase', lineHeight: 1 }}>¡COMIENZA AQUÍ!</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                Precios sujetos a cambio · Vigencia: {cotizacion.vigencia_dias} días naturales
              </div>
            </div>
            <div style={{ textAlign: 'center', maxWidth: 150 }}>
              <div style={{ fontSize: 11.5, color: '#1d4ed8', lineHeight: 1.5 }}>
                En {tenant.nombre || 'nuestro concesionario'} nos apasiona<br/>acompañarte en cada kilómetro.
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
