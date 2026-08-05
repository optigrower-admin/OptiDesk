import type { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailComoEmpresa } from '@/lib/email'
import { ETAPAS, type EtapaVenta } from '@/lib/ventas/pipeline'

type Supa = ReturnType<typeof createAdminClient>

interface ClienteFila { id: string; nombre: string | null; etapa_venta: EtapaVenta; updated_at: string }
interface RecordatorioFila { cliente_id: string | null; nota: string | null; fecha_recordatorio: string }

export interface DatosResumenPipeline {
  nombre: string
  porEtapa: { etapa: EtapaVenta; label: string; color: string; count: number }[]
  detalle: { etapa: EtapaVenta; label: string; color: string; clientes: { nombre: string; diasSinMovimiento: number; recordatorios: string[] }[] }[]
}

const ETAPAS_EXCLUIDAS = new Set<EtapaVenta>(['perdido', 'proceso_finalizado'])

// ── Datos ──────────────────────────────────────────────────────────────────────
export async function obtenerDatosResumenPipeline(
  supabase: Supa, tenantId: string, usuarioId: string, nombreUsuario: string
): Promise<DatosResumenPipeline> {
  const [{ data: clientes }, { data: recordatorios }] = await Promise.all([
    supabase.from('clientes')
      .select('id, nombre, etapa_venta, updated_at')
      .eq('tenant_id', tenantId).eq('assigned_to', usuarioId).eq('en_seguimiento_ventas', true)
      .not('etapa_venta', 'in', '("perdido","proceso_finalizado")'),
    supabase.from('recordatorios')
      .select('cliente_id, nota, fecha_recordatorio')
      .eq('tenant_id', tenantId).eq('asignado_a', usuarioId).eq('completado', false)
      .not('cliente_id', 'is', null),
  ])

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
    if (ETAPAS_EXCLUIDAS.has(c.etapa_venta)) continue
    const dias = Math.max(0, Math.floor((ahora - new Date(c.updated_at).getTime()) / 86400000))
    if (!porEtapaMap.has(c.etapa_venta)) porEtapaMap.set(c.etapa_venta, [])
    porEtapaMap.get(c.etapa_venta)!.push({
      nombre: c.nombre ?? 'Sin nombre', diasSinMovimiento: dias, recordatorios: recPorCliente.get(c.id) ?? [],
    })
  }

  const etapasConDatos = ETAPAS.filter(e => !ETAPAS_EXCLUIDAS.has(e.id) && (porEtapaMap.get(e.id)?.length ?? 0) > 0)

  return {
    nombre: nombreUsuario,
    porEtapa: etapasConDatos.map(e => ({ etapa: e.id, label: e.label, color: e.color, count: porEtapaMap.get(e.id)?.length ?? 0 })),
    detalle: etapasConDatos.map(e => ({
      etapa: e.id, label: e.label, color: e.color,
      clientes: (porEtapaMap.get(e.id) ?? []).sort((a, b) => b.diasSinMovimiento - a.diasSinMovimiento),
    })),
  }
}

// ── HTML del correo (tablas con estilos inline — compatible con clientes de correo) ──
export function construirResumenPipelineHtml(datos: DatosResumenPipeline): string {
  const { nombre, porEtapa, detalle } = datos
  const total = porEtapa.reduce((s, e) => s + e.count, 0)

  if (porEtapa.length === 0) {
    return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width:640px; margin:0 auto; color:#111827;">
      <p style="font-size:15px;">👋 Hola <strong>${nombre}</strong>, este es tu resumen del pipeline en OptiDesk:</p>
      <p style="color:#9ca3af; font-size:13px;">Sin clientes activos en seguimiento por el momento. 🎉</p>
    </div>`
  }

  const maxCount = Math.max(1, ...porEtapa.map(e => e.count))
  const ALTURA_MAX = 120

  const barritas = porEtapa.map(e => {
    const alto = Math.max(6, Math.round((e.count / maxCount) * ALTURA_MAX))
    return `<td style="vertical-align:bottom; text-align:center; padding:0 6px;">
      <div style="font-size:12px; font-weight:700; color:#374151; margin-bottom:2px;">${e.count}</div>
      <div style="width:26px; height:${alto}px; background:${e.color}; border-radius:4px 4px 0 0; margin:0 auto;"></div>
    </td>`
  }).join('')

  const etiquetas = porEtapa.map(e =>
    `<td style="text-align:center; padding:4px 4px 0; width:40px; vertical-align:top;">
      <span style="font-size:9px; color:#6b7280; line-height:1.2; display:block;">${e.label}</span>
    </td>`
  ).join('')

  const secciones = detalle.map(e => {
    const filas = e.clientes.map(c => `
      <tr>
        <td style="padding:6px 10px; border-bottom:1px solid #f3f4f6; font-size:13px; color:#111827;">${c.nombre}</td>
        <td style="padding:6px 10px; border-bottom:1px solid #f3f4f6; font-size:12px; text-align:right; white-space:nowrap;">
          <span style="background:${c.diasSinMovimiento > 7 ? '#fee2e2' : '#f3f4f6'}; color:${c.diasSinMovimiento > 7 ? '#b91c1c' : '#6b7280'}; padding:2px 8px; border-radius:9999px; font-weight:600;">${c.diasSinMovimiento}d sin mov.</span>
        </td>
        <td style="padding:6px 10px; border-bottom:1px solid #f3f4f6; font-size:12px; color:#7c3aed;">${c.recordatorios.length ? c.recordatorios.join('<br>') : '<span style="color:#d1d5db;">—</span>'}</td>
      </tr>`).join('')

    return `<table role="presentation" width="100%" style="border-collapse:collapse; margin-bottom:18px; border:1px solid #f3f4f6; border-radius:8px; overflow:hidden;">
      <tr><td colspan="3" style="padding:10px; font-size:13px; font-weight:700; color:#ffffff; background:${e.color};">${e.label} (${e.clientes.length})</td></tr>
      ${filas}
    </table>`
  }).join('')

  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width:640px; margin:0 auto; color:#111827;">
    <p style="font-size:15px;">👋 Hola <strong>${nombre}</strong>, este es tu resumen del pipeline en OptiDesk:</p>
    <p style="text-align:center; font-size:13px; color:#6b7280; margin:16px 0 8px;">Clientes activos: <strong style="color:#111827;">${total}</strong></p>
    <table role="presentation" align="center" style="border-collapse:collapse; margin:0 auto 24px;">
      <tr>${barritas}</tr>
      <tr>${etiquetas}</tr>
    </table>
    ${secciones}
  </div>`
}

// ── Envío ──────────────────────────────────────────────────────────────────────
export async function enviarResumenPipeline(
  supabase: Supa, tenantId: string, usuarioId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: usuario } = await supabase.from('usuarios').select('id, nombre, email').eq('id', usuarioId).maybeSingle()
  if (!usuario) return { ok: false, error: 'Colaborador no encontrado' }
  if (!usuario.email) return { ok: false, error: 'El colaborador no tiene correo de notificación configurado' }

  const datos = await obtenerDatosResumenPipeline(supabase, tenantId, usuarioId, usuario.nombre ?? 'colaborador')
  const html = construirResumenPipelineHtml(datos)
  const total = datos.porEtapa.reduce((s, e) => s + e.count, 0)

  try {
    await sendEmailComoEmpresa(tenantId, usuario.email, `📊 Tu resumen de pipeline — ${total} cliente${total === 1 ? '' : 's'} activo${total === 1 ? '' : 's'}`, html)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error al enviar el correo' }
  }
}

// Sin tenantId: recorre todos los tenants (uso del cron diario). Con
// tenantId: solo ese tenant (disparo manual desde Bot Colaboradores).
export async function ejecutarResumenPipelineTodos(supabase: Supa, tenantId?: string): Promise<{ enviados: number; fallidos: number }> {
  let query = supabase.from('usuarios').select('id, tenant_id').eq('recibe_resumen_pipeline', true).eq('activo', true)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data: usuarios } = await query

  let enviados = 0, fallidos = 0
  for (const u of (usuarios ?? []) as { id: string; tenant_id: string }[]) {
    const r = await enviarResumenPipeline(supabase, u.tenant_id, u.id)
    if (r.ok) enviados++; else fallidos++
  }
  return { enviados, fallidos }
}
