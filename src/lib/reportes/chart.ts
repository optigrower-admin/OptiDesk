import sharp from 'sharp'

export interface BarraDatum { label: string; count: number; color: string }

// ── Gráfico de barras en HTML (tabla con estilos inline) para correo ──────────
// Las tablas con estilos inline son lo único que renderiza igual en todos los
// clientes de correo (Gmail, Outlook, Apple Mail) — nada de flexbox/grid ni JS.
export function barrasHtml(datos: BarraDatum[]): string {
  if (datos.length === 0) return ''
  const maxCount = Math.max(1, ...datos.map(d => d.count))
  const ALTURA_MAX = 120

  const barritas = datos.map(d => {
    const alto = Math.max(6, Math.round((d.count / maxCount) * ALTURA_MAX))
    return `<td style="vertical-align:bottom; text-align:center; padding:0 6px;">
      <div style="font-size:12px; font-weight:700; color:#374151; margin-bottom:2px;">${d.count}</div>
      <div style="width:26px; height:${alto}px; background:${d.color}; border-radius:4px 4px 0 0; margin:0 auto;"></div>
    </td>`
  }).join('')

  const etiquetas = datos.map(d =>
    `<td style="text-align:center; padding:4px 4px 0; width:44px; vertical-align:top;">
      <span style="font-size:9px; color:#6b7280; line-height:1.2; display:block;">${d.label}</span>
    </td>`
  ).join('')

  return `<table role="presentation" align="center" style="border-collapse:collapse; margin:0 auto 24px;">
    <tr>${barritas}</tr>
    <tr>${etiquetas}</tr>
  </table>`
}

// ── El mismo gráfico como SVG → PNG, para enviar como imagen por WhatsApp ─────
export function barrasSvg(datos: BarraDatum[]): string {
  const ANCHO_BARRA = 56, GAP = 14, ALTURA_MAX = 200, PAD_TOP = 30, PAD_BOTTOM = 60, PAD_X = 20
  const maxCount = Math.max(1, ...datos.map(d => d.count))
  const ancho = PAD_X * 2 + datos.length * (ANCHO_BARRA + GAP) - GAP
  const alto = PAD_TOP + ALTURA_MAX + PAD_BOTTOM

  const barras = datos.map((d, i) => {
    const h = Math.max(8, Math.round((d.count / maxCount) * ALTURA_MAX))
    const x = PAD_X + i * (ANCHO_BARRA + GAP)
    const y = PAD_TOP + (ALTURA_MAX - h)
    const etiqueta = d.label.length > 14 ? d.label.slice(0, 13) + '…' : d.label
    return `
      <text x="${x + ANCHO_BARRA / 2}" y="${y - 8}" font-size="16" font-weight="700" fill="#374151" text-anchor="middle">${d.count}</text>
      <rect x="${x}" y="${y}" width="${ANCHO_BARRA}" height="${h}" rx="6" fill="${d.color}" />
      <text x="${x + ANCHO_BARRA / 2}" y="${PAD_TOP + ALTURA_MAX + 22}" font-size="12" fill="#4b5563" text-anchor="middle">${etiqueta}</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">
    <rect width="${ancho}" height="${alto}" fill="#ffffff" />
    ${barras}
  </svg>`
}

export async function barrasPng(datos: BarraDatum[]): Promise<Buffer> {
  const svg = barrasSvg(datos)
  return sharp(Buffer.from(svg)).png().toBuffer()
}
