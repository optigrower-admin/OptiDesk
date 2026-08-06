import type { createAdminClient } from '@/lib/supabase/admin'
import { ETAPAS, type EtapaVenta } from '@/lib/ventas/pipeline'
import { barrasHtml, barrasPng, type BarraDatum } from './chart'

type Supa = ReturnType<typeof createAdminClient>

// El reporte de pipeline es una foto del estado ACTUAL del embudo comercial,
// desde el primer contacto hasta que la moto queda en espera de entrega —
// no incluye posventa (revisiones) ni etapas cerradas (perdido, entregada,
// proceso finalizado), y no se filtra por fecha de creación del cliente:
// un cliente en Alistamiento normalmente se creó hace semanas, no "hoy".
const ETAPAS_INCLUIDAS: EtapaVenta[] = [
  'nuevo', 'con_interes', 'con_objecion',
  'seguimiento', 'buscando_credito', 'en_proceso_credito',
  'ganado', 'aprobado_matricula', 'en_matricula', 'alistamiento', 'espera_entrega',
]

export interface DatosPipelineSeccion {
  titulo: string
  total: number
  porEtapa: BarraDatum[]
  detalle: { label: string; color: string; clientes: { nombre: string; diasSinMovimiento: number; recordatorios: string[] }[] }[]
}

interface ClienteFila { id: string; nombre: string | null; etapa_venta: EtapaVenta; updated_at: string }
interface RecordatorioFila { cliente_id: string | null; nota: string | null; fecha_recordatorio: string }

async function seccionParaUsuario(
  supabase: Supa, tenantId: string, usuarioId: string | null, titulo: string
): Promise<DatosPipelineSeccion> {
  let qClientes = supabase.from('clientes')
    .select('id, nombre, etapa_venta, updated_at')
    .eq('tenant_id', tenantId).eq('en_seguimiento_ventas', true)
    .in('etapa_venta', ETAPAS_INCLUIDAS)
  if (usuarioId) qClientes = qClientes.eq('assigned_to', usuarioId)

  let qRecordatorios = supabase.from('recordatorios')
    .select('cliente_id, nota, fecha_recordatorio')
    .eq('tenant_id', tenantId).eq('completado', false).not('cliente_id', 'is', null)
  if (usuarioId) qRecordatorios = qRecordatorios.eq('asignado_a', usuarioId)

  const [{ data: clientes }, { data: recordatorios }] = await Promise.all([qClientes, qRecordatorios])

  const recPorCliente = new Map<string, string[]>()
  for (const r of (recordatorios ?? []) as RecordatorioFila[]) {
    if (!r.cliente_id) continue
    const fecha = new Date(r.fecha_recordatorio).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
    const texto = `${fecha}${r.nota ? ` — ${r.nota}` : ''}`
    if (!recPorCliente.has(r.cliente_id)) recPorCliente.set(r.cliente_id, [])
    recPorCliente.get(r.cliente_id)!.push(texto)
  }

  const ahora = Date.now()
  const porEtapaMap = new Map<EtapaVenta, { nombre: string; diasSinMovimiento: number; recordatorios: string[] }[]>()
  for (const c of (clientes ?? []) as ClienteFila[]) {
    const dias = Math.max(0, Math.floor((ahora - new Date(c.updated_at).getTime()) / 86400000))
    if (!porEtapaMap.has(c.etapa_venta)) porEtapaMap.set(c.etapa_venta, [])
    porEtapaMap.get(c.etapa_venta)!.push({ nombre: c.nombre ?? 'Sin nombre', diasSinMovimiento: dias, recordatorios: recPorCliente.get(c.id) ?? [] })
  }

  const etapasConDatos = ETAPAS.filter(e => ETAPAS_INCLUIDAS.includes(e.id) && (porEtapaMap.get(e.id)?.length ?? 0) > 0)
  const total = etapasConDatos.reduce((s, e) => s + (porEtapaMap.get(e.id)?.length ?? 0), 0)

  return {
    titulo, total,
    porEtapa: etapasConDatos.map(e => ({ label: e.label, count: porEtapaMap.get(e.id)?.length ?? 0, color: e.color })),
    detalle: etapasConDatos.map(e => ({
      label: e.label, color: e.color,
      clientes: (porEtapaMap.get(e.id) ?? []).sort((a, b) => b.diasSinMovimiento - a.diasSinMovimiento),
    })),
  }
}

// usuario.rol determina si aplica modoGerencia ('general' = todo el equipo en
// una sola sección; 'por_usuario' = una sección por cada asesor con datos).
export async function obtenerSeccionesPipeline(
  supabase: Supa, tenantId: string, usuario: { id: string; nombre: string; rol: string },
  modoGerencia: 'general' | 'por_usuario',
): Promise<DatosPipelineSeccion[]> {
  const rolNorm = (usuario.rol ?? '').toLowerCase().replace('ñ', 'n')
  const esGerencia = ['gerencia', 'dueno', 'control_total'].includes(rolNorm)

  if (!esGerencia) {
    return [await seccionParaUsuario(supabase, tenantId, usuario.id, usuario.nombre)]
  }
  if (modoGerencia === 'general') {
    return [await seccionParaUsuario(supabase, tenantId, null, 'Todo el equipo')]
  }

  const { data: asesores } = await supabase.from('usuarios')
    .select('id, nombre').eq('tenant_id', tenantId).eq('activo', true)
  const secciones = await Promise.all(
    ((asesores ?? []) as { id: string; nombre: string | null }[])
      .map(a => seccionParaUsuario(supabase, tenantId, a.id, a.nombre ?? 'Sin nombre'))
  )
  return secciones.filter(s => s.total > 0)
}

// ── Render: correo (HTML, todas las secciones en un solo envío) ───────────────
// El pipeline es una foto del estado actual — no varía por período elegido.
export function construirPipelineHtml(secciones: DatosPipelineSeccion[], nombreDestinatario: string): string {
  if (secciones.length === 0 || secciones.every(s => s.total === 0)) {
    return `<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width:640px; margin:0 auto; color:#111827;">
      <p style="font-size:15px;">👋 Hola <strong>${nombreDestinatario}</strong>, este es tu resumen de pipeline:</p>
      <p style="color:#9ca3af; font-size:13px;">Sin clientes activos en el pipeline. 🎉</p>
    </div>`
  }

  const bloques = secciones.map(s => {
    const filasPorEtapa = s.detalle.map(e => {
      const filas = e.clientes.map(c => `
        <tr>
          <td style="padding:6px 10px; border-bottom:1px solid #f3f4f6; font-size:13px; color:#111827;">${c.nombre}</td>
          <td style="padding:6px 10px; border-bottom:1px solid #f3f4f6; font-size:12px; text-align:right; white-space:nowrap;">
            <span style="background:${c.diasSinMovimiento > 7 ? '#fee2e2' : '#f3f4f6'}; color:${c.diasSinMovimiento > 7 ? '#b91c1c' : '#6b7280'}; padding:2px 8px; border-radius:9999px; font-weight:600;">${c.diasSinMovimiento}d sin mov.</span>
          </td>
          <td style="padding:6px 10px; border-bottom:1px solid #f3f4f6; font-size:12px; color:#7c3aed;">${c.recordatorios.length ? c.recordatorios.join('<br>') : '<span style="color:#d1d5db;">—</span>'}</td>
        </tr>`).join('')
      return `<table role="presentation" width="100%" style="border-collapse:collapse; margin-bottom:14px; border:1px solid #f3f4f6; border-radius:8px; overflow:hidden;">
        <tr><td colspan="3" style="padding:9px; font-size:12.5px; font-weight:700; color:#ffffff; background:${e.color};">${e.label} (${e.clientes.length})</td></tr>
        ${filas}
      </table>`
    }).join('')

    return `<div style="margin-bottom:28px;">
      <p style="font-size:14px; font-weight:700; color:#111827; border-bottom:2px solid #e5e7eb; padding-bottom:6px;">${s.titulo} — ${s.total} cliente${s.total === 1 ? '' : 's'}</p>
      ${barrasHtml(s.porEtapa)}
      ${filasPorEtapa}
    </div>`
  }).join('')

  return `<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width:640px; margin:0 auto; color:#111827;">
    <p style="font-size:15px;">👋 Hola <strong>${nombreDestinatario}</strong>, este es tu resumen de pipeline:</p>
    ${bloques}
  </div>`
}

// ── Render: WhatsApp (una imagen + texto de detalle por sección) ──────────────
export async function construirPipelineWhatsapp(seccion: DatosPipelineSeccion): Promise<{ imagen: Buffer; caption: string; textoDetalle: string }> {
  const imagen = await barrasPng(seccion.porEtapa)
  const caption = `📊 *${seccion.titulo}* — Resumen de pipeline\n${seccion.total} cliente${seccion.total === 1 ? '' : 's'} activo${seccion.total === 1 ? '' : 's'}`

  let textoDetalle = ''
  for (const e of seccion.detalle) {
    textoDetalle += `\n*${e.label}* (${e.clientes.length})\n`
    for (const c of e.clientes.slice(0, 15)) {
      const rec = c.recordatorios.length ? ` — ${c.recordatorios[0]}` : ''
      textoDetalle += `• ${c.nombre} (${c.diasSinMovimiento}d sin mov.)${rec}\n`
    }
    if (e.clientes.length > 15) textoDetalle += `  ...y ${e.clientes.length - 15} más\n`
  }
  return { imagen, caption, textoDetalle: textoDetalle.trim() }
}
