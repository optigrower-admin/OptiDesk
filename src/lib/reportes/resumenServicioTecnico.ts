import type { createAdminClient } from '@/lib/supabase/admin'
import { barrasHtml, barrasPng, type BarraDatum } from './chart'
import { PERIODO_LABEL, type PeriodoReporte } from './periodo'
import { esGerenciaParaReportes } from './permisos'

type Supa = ReturnType<typeof createAdminClient>

const ESTADO_LABEL: Record<string, string> = {
  programado: 'Programado', falta_revision: 'Falta revisión', en_proceso: 'En proceso',
  pendiente: 'Pendiente', pagado: 'Pagado', listo: 'Finalizado', finalizado_incompleto: 'Finalizado - Incompleto',
}
const ESTADO_COLOR: Record<string, string> = {
  programado: '#0369A1', falta_revision: '#DC2626', en_proceso: '#7E22CE',
  pendiente: '#D97706', pagado: '#16A34A', listo: '#15803D', finalizado_incompleto: '#4B5563',
}
const ORDEN_ESTADOS = ['programado', 'falta_revision', 'en_proceso', 'pendiente', 'pagado', 'listo', 'finalizado_incompleto']
const ESTADO_EXCLUIDO_DETALLE = 'listo' // "Finalizado" — solo sale en la gráfica, no en el detalle

interface OrdenFila {
  id: string; numero: number | null; placa: string | null; cliente: string | null
  estado: string; created_at: string; numeros_orden_uma: string[] | null
  categorias_servicio: { nombre: string } | { nombre: string }[] | null
}

export interface DatosServicioTecnicoSeccion {
  titulo: string
  total: number
  faltaUma: number
  porEstado: BarraDatum[]
  detalle: { estado: string; label: string; color: string; ordenes: { numero: number | string; referencia: string; faltaUma: boolean }[] }[]
}

function nombreCategoria(c: OrdenFila['categorias_servicio']): string {
  if (!c) return ''
  return Array.isArray(c) ? (c[0]?.nombre ?? '') : c.nombre
}

function esUmaFaltante(o: OrdenFila): boolean {
  if (!nombreCategoria(o.categorias_servicio).toLowerCase().includes('uma')) return false
  const nums = (o.numeros_orden_uma ?? []).filter(n => n !== 'N/A')
  return nums.length === 0
}

async function seccionParaUsuario(
  supabase: Supa, tenantId: string, mecanicoId: string | null, titulo: string, desdeISO: string, hastaISO: string
): Promise<DatosServicioTecnicoSeccion> {
  let q = supabase.from('ordenes')
    .select('id, numero, placa, cliente, estado, created_at, numeros_orden_uma, categorias_servicio(nombre)')
    .eq('tenant_id', tenantId).neq('tipo_orden', 'venta_repuestos')
    .gte('created_at', desdeISO).lte('created_at', hastaISO)
  if (mecanicoId) q = q.eq('mecanico_id', mecanicoId)
  const { data } = await q

  const ordenes = (data ?? []) as unknown as OrdenFila[]
  const porEstadoMap = new Map<string, OrdenFila[]>()
  for (const o of ordenes) {
    if (!porEstadoMap.has(o.estado)) porEstadoMap.set(o.estado, [])
    porEstadoMap.get(o.estado)!.push(o)
  }

  const faltaUma = ordenes.filter(esUmaFaltante).length
  const estadosConDatos = ORDEN_ESTADOS.filter(e => (porEstadoMap.get(e)?.length ?? 0) > 0)

  return {
    titulo, total: ordenes.length, faltaUma,
    porEstado: estadosConDatos.map(e => ({ label: ESTADO_LABEL[e], count: porEstadoMap.get(e)?.length ?? 0, color: ESTADO_COLOR[e] })),
    detalle: estadosConDatos.filter(e => e !== ESTADO_EXCLUIDO_DETALLE).map(e => ({
      estado: e, label: ESTADO_LABEL[e], color: ESTADO_COLOR[e],
      ordenes: (porEstadoMap.get(e) ?? []).map(o => ({
        numero: o.numero ?? '—', referencia: o.placa ?? o.cliente ?? 'Sin referencia', faltaUma: esUmaFaltante(o),
      })),
    })),
  }
}

export async function obtenerSeccionesServicioTecnico(
  supabase: Supa, tenantId: string, usuario: { id: string; nombre: string; rol: string; reportesVeTodo?: boolean | null },
  desdeISO: string, hastaISO: string, modoGerencia: 'general' | 'por_usuario',
): Promise<DatosServicioTecnicoSeccion[]> {
  const esGerencia = esGerenciaParaReportes(usuario.rol, usuario.reportesVeTodo)

  if (!esGerencia) {
    return [await seccionParaUsuario(supabase, tenantId, usuario.id, usuario.nombre, desdeISO, hastaISO)]
  }
  if (modoGerencia === 'general') {
    return [await seccionParaUsuario(supabase, tenantId, null, 'Todo el taller', desdeISO, hastaISO)]
  }

  const { data: mecanicos } = await supabase.from('usuarios')
    .select('id, nombre').eq('tenant_id', tenantId).eq('rol', 'mecanico').eq('activo', true)
  const secciones = await Promise.all(
    ((mecanicos ?? []) as { id: string; nombre: string | null }[])
      .map(m => seccionParaUsuario(supabase, tenantId, m.id, m.nombre ?? 'Sin nombre', desdeISO, hastaISO))
  )
  return secciones.filter(s => s.total > 0)
}

export function construirServicioTecnicoHtml(secciones: DatosServicioTecnicoSeccion[], periodo: PeriodoReporte, nombreDestinatario: string): string {
  if (secciones.length === 0 || secciones.every(s => s.total === 0)) {
    return `<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width:640px; margin:0 auto; color:#111827;">
      <p style="font-size:15px;">👋 Hola <strong>${nombreDestinatario}</strong>, este es tu resumen de Servicio Técnico (${PERIODO_LABEL[periodo]}):</p>
      <p style="color:#9ca3af; font-size:13px;">Sin órdenes en este período.</p>
    </div>`
  }

  const bloques = secciones.map(s => {
    const filasPorEstado = s.detalle.map(e => {
      const filas = e.ordenes.map(o => `
        <tr>
          <td style="padding:6px 10px; border-bottom:1px solid #f3f4f6; font-size:13px; color:#111827;">#${o.numero} · ${o.referencia}</td>
          <td style="padding:6px 10px; border-bottom:1px solid #f3f4f6; font-size:12px; text-align:right;">
            ${o.faltaUma ? '<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:9999px; font-weight:600;">⚠ Falta # UMA</span>' : ''}
          </td>
        </tr>`).join('')
      return `<table role="presentation" width="100%" style="border-collapse:collapse; margin-bottom:14px; border:1px solid #f3f4f6; border-radius:8px; overflow:hidden;">
        <tr><td colspan="2" style="padding:9px; font-size:12.5px; font-weight:700; color:#ffffff; background:${e.color};">${e.label} (${e.ordenes.length})</td></tr>
        ${filas}
      </table>`
    }).join('')

    return `<div style="margin-bottom:28px;">
      <p style="font-size:14px; font-weight:700; color:#111827; border-bottom:2px solid #e5e7eb; padding-bottom:6px;">${s.titulo} — ${s.total} orden${s.total === 1 ? '' : 'es'}</p>
      ${s.faltaUma > 0 ? `<p style="font-size:12.5px; color:#b45309; background:#fef3c7; display:inline-block; padding:4px 10px; border-radius:8px; margin:8px 0;">⚠ ${s.faltaUma} orden${s.faltaUma === 1 ? '' : 'es'} sin número de orden UMA</p>` : ''}
      ${barrasHtml(s.porEstado)}
      ${filasPorEstado}
    </div>`
  }).join('')

  return `<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width:640px; margin:0 auto; color:#111827;">
    <p style="font-size:15px;">👋 Hola <strong>${nombreDestinatario}</strong>, este es tu resumen de Servicio Técnico (${PERIODO_LABEL[periodo]}):</p>
    ${bloques}
  </div>`
}

export async function construirServicioTecnicoWhatsapp(seccion: DatosServicioTecnicoSeccion, periodo: PeriodoReporte): Promise<{ imagen: Buffer; caption: string; textoDetalle: string }> {
  const imagen = await barrasPng(seccion.porEstado)
  const umaLinea = seccion.faltaUma > 0 ? `\n⚠ ${seccion.faltaUma} orden${seccion.faltaUma === 1 ? '' : 'es'} sin número de orden UMA` : ''
  const caption = `🔧 *${seccion.titulo}* — Resumen Servicio Técnico (${PERIODO_LABEL[periodo]})\n${seccion.total} orden${seccion.total === 1 ? '' : 'es'}${umaLinea}`

  let textoDetalle = ''
  for (const e of seccion.detalle) {
    textoDetalle += `\n*${e.label}* (${e.ordenes.length})\n`
    for (const o of e.ordenes.slice(0, 15)) {
      textoDetalle += `• #${o.numero} ${o.referencia}${o.faltaUma ? ' ⚠ Falta UMA' : ''}\n`
    }
    if (e.ordenes.length > 15) textoDetalle += `  ...y ${e.ordenes.length - 15} más\n`
  }
  return { imagen, caption, textoDetalle: textoDetalle.trim() }
}
