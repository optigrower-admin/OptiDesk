import type { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailComoUsuario } from '@/lib/email'
import { enviarWADirecto, getCfgMeta } from '@/lib/mensajeria/enviar-wa-directo'

type RecordatorioRow = {
  id: string
  nota: string | null
  fecha_recordatorio: string
  clientes: { nombre: string | null; assigned_to: string | null } | { nombre: string | null; assigned_to: string | null }[] | null
}

function clienteInfo(r: RecordatorioRow): { nombre: string; assignedTo: string | null } {
  const c = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
  return { nombre: c?.nombre ?? 'Cliente', assignedTo: c?.assigned_to ?? null }
}

function clienteNombre(r: RecordatorioRow): string {
  return clienteInfo(r).nombre
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
}

function construirTexto(nombre: string, vencidas: RecordatorioRow[], hoyItems: RecordatorioRow[]): string {
  let txt = `👋 Hola ${nombre}, este es tu resumen del día en OptiDesk:\n`
  if (vencidas.length > 0) {
    txt += `\n⏰ VENCIDAS (${vencidas.length})\n`
    for (const v of vencidas) txt += `• ${clienteNombre(v)} — ${v.nota ?? 'sin nota'}\n`
  }
  if (hoyItems.length > 0) {
    txt += `\n📅 HOY (${hoyItems.length})\n`
    for (const h of hoyItems) txt += `• ${fmtHora(h.fecha_recordatorio)} ${clienteNombre(h)} — ${h.nota ?? 'sin nota'}\n`
  }
  return txt
}

function construirHtml(nombre: string, vencidas: RecordatorioRow[], hoyItems: RecordatorioRow[]): string {
  const fila = (r: RecordatorioRow, hora?: string) =>
    `<li><strong>${clienteNombre(r)}</strong>${hora ? ` — ${hora}` : ''} — ${r.nota ?? 'sin nota'}</li>`
  return `
    <p>👋 Hola ${nombre}, este es tu resumen del día en OptiDesk:</p>
    ${vencidas.length > 0 ? `<p><strong>⏰ Vencidas (${vencidas.length})</strong></p><ul>${vencidas.map(v => fila(v)).join('')}</ul>` : ''}
    ${hoyItems.length > 0 ? `<p><strong>📅 Hoy (${hoyItems.length})</strong></p><ul>${hoyItems.map(h => fila(h, fmtHora(h.fecha_recordatorio))).join('')}</ul>` : ''}
  `
}

export type ResultadoResumenDiario = {
  usuariosNotificados: number
  whatsappEnviados: number
  emailsEnviados: number
  emailsFallidos: number
}

// Envía a cada asesor (con acciones vencidas o de hoy en sus clientes) un resumen
// consolidado por WhatsApp (si hay sesión de 24h activa con el bot) y por correo
// (si conectó su Gmail). El asesor "dueño" de una acción es el asesor asignado al
// CLIENTE (clientes.assigned_to) — no quien haya registrado el recordatorio, que
// puede ser otra persona (ej. Gerencia anotando algo para un cliente ajeno).
// Usado tanto por el cron diario como por el disparo manual desde Bot Colaboradores.
export async function ejecutarResumenDiario(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId?: string,
  usuarioId?: string,
): Promise<ResultadoResumenDiario> {
  const ahora = new Date()
  const finHoyBogota = new Date(
    new Date(ahora.getTime() - 5 * 3600_000).toISOString().slice(0, 10) + 'T23:59:59-05:00'
  )

  let query = supabase
    .from('recordatorios')
    .select('id, nota, fecha_recordatorio, tenant_id, clientes!inner(nombre, assigned_to)')
    .eq('completado', false)
    .not('cliente_id', 'is', null)
    .not('clientes.assigned_to', 'is', null)
    .lte('fecha_recordatorio', finHoyBogota.toISOString())
  if (tenantId) query = query.eq('tenant_id', tenantId)
  if (usuarioId) query = query.eq('clientes.assigned_to', usuarioId)
  const { data: recs } = await query

  const porUsuario = new Map<string, RecordatorioRow[]>()
  for (const r of (recs ?? []) as RecordatorioRow[]) {
    const assignedTo = clienteInfo(r).assignedTo
    if (!assignedTo) continue
    if (!porUsuario.has(assignedTo)) porUsuario.set(assignedTo, [])
    porUsuario.get(assignedTo)!.push(r)
  }

  let usuariosNotificados = 0, whatsappEnviados = 0, emailsEnviados = 0, emailsFallidos = 0
  const cfgCache = new Map<string, Awaited<ReturnType<typeof getCfgMeta>>>()

  for (const [usuarioId, items] of porUsuario) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, nombre, email, tenant_id, whatsapp_number, wa_sesion_at')
      .eq('id', usuarioId).single()
    if (!usuario) continue

    const vencidas = items.filter(i => new Date(i.fecha_recordatorio).getTime() < ahora.getTime())
    const hoyItems = items.filter(i => new Date(i.fecha_recordatorio).getTime() >= ahora.getTime())
    if (vencidas.length === 0 && hoyItems.length === 0) continue

    usuariosNotificados++

    const sesionActiva = usuario.wa_sesion_at && (Date.now() - new Date(usuario.wa_sesion_at).getTime()) < 24 * 3600_000
    if (sesionActiva && usuario.whatsapp_number) {
      if (!cfgCache.has(usuario.tenant_id)) cfgCache.set(usuario.tenant_id, await getCfgMeta(supabase, usuario.tenant_id))
      const cfg = cfgCache.get(usuario.tenant_id)
      if (cfg) {
        const ok = await enviarWADirecto(cfg, usuario.whatsapp_number, construirTexto(usuario.nombre, vencidas, hoyItems))
        if (ok) whatsappEnviados++
      }
    }

    try {
      await sendEmailComoUsuario(
        usuario.id, usuario.email,
        `📋 Tu resumen de hoy — ${vencidas.length + hoyItems.length} pendiente${vencidas.length + hoyItems.length === 1 ? '' : 's'}`,
        construirHtml(usuario.nombre, vencidas, hoyItems)
      )
      emailsEnviados++
    } catch (e) {
      emailsFallidos++
      console.warn(`[resumenDiario] No se pudo enviar correo a ${usuario.nombre}:`, e instanceof Error ? e.message : e)
    }
  }

  return { usuariosNotificados, whatsappEnviados, emailsEnviados, emailsFallidos }
}
