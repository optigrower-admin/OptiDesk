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

// "lunes 12/jun/26" — día de la semana en texto y fecha corta, para las vencidas.
function fmtDiaVencido(iso: string): string {
  const d = new Date(iso)
  const dia   = d.toLocaleDateString('es-CO', { weekday: 'long', timeZone: 'America/Bogota' })
  const num   = d.toLocaleDateString('es-CO', { day: '2-digit', timeZone: 'America/Bogota' })
  const mes   = d.toLocaleDateString('es-CO', { month: 'short', timeZone: 'America/Bogota' }).replace('.', '')
  const anio  = d.toLocaleDateString('es-CO', { year: '2-digit', timeZone: 'America/Bogota' })
  return `${dia} ${num}/${mes}/${anio}`
}

function construirTexto(nombre: string, vencidas: RecordatorioRow[], hoyItems: RecordatorioRow[]): string {
  let txt = `👋 Hola ${nombre}, este es tu resumen del día en OptiDesk:\n`
  if (vencidas.length > 0) {
    txt += `\n⏰ VENCIDAS (${vencidas.length})\n`
    for (const v of vencidas) txt += `• *${clienteNombre(v)}* (${fmtDiaVencido(v.fecha_recordatorio)}) — ${v.nota ?? 'sin nota'}\n`
  }
  if (hoyItems.length > 0) {
    txt += `\n📅 HOY (${hoyItems.length})\n`
    for (const h of hoyItems) txt += `• ${fmtHora(h.fecha_recordatorio)} *${clienteNombre(h)}* — ${h.nota ?? 'sin nota'}\n`
  }
  return txt
}

function construirHtml(nombre: string, vencidas: RecordatorioRow[], hoyItems: RecordatorioRow[]): string {
  const filaVencida = (r: RecordatorioRow) =>
    `<li><strong>${clienteNombre(r)}</strong> (${fmtDiaVencido(r.fecha_recordatorio)}) — ${r.nota ?? 'sin nota'}</li>`
  const filaHoy = (r: RecordatorioRow) =>
    `<li><strong>${clienteNombre(r)}</strong> — ${fmtHora(r.fecha_recordatorio)} — ${r.nota ?? 'sin nota'}</li>`
  return `
    <p>👋 Hola ${nombre}, este es tu resumen del día en OptiDesk:</p>
    ${vencidas.length > 0 ? `<p><strong>⏰ Vencidas (${vencidas.length})</strong></p><ul>${vencidas.map(filaVencida).join('')}</ul>` : ''}
    ${hoyItems.length > 0 ? `<p><strong>📅 Hoy (${hoyItems.length})</strong></p><ul>${hoyItems.map(filaHoy).join('')}</ul>` : ''}
  `
}

export type ResultadoResumenDiario = {
  usuariosNotificados: number
  whatsappEnviados: number
  emailsEnviados: number
  emailsFallidos: number
}

// Un solo correo (el de Gerencia) envía los resúmenes de todos los asesores del
// tenant — no se le pide a cada asesor que conecte su propio Gmail. Se usa quien
// ya tenga el Gmail conectado (Mi perfil), dando prioridad a gerencia/dueño.
async function buscarRemitente(supabase: ReturnType<typeof createAdminClient>, tenantId: string): Promise<string | null> {
  const { data } = await supabase
    .from('usuarios')
    .select('id, rol')
    .eq('tenant_id', tenantId)
    .not('email_smtp_usuario', 'is', null)
  if (!data || data.length === 0) return null
  const gerente = data.find(u => ['gerencia', 'dueno', 'control_total'].includes((u.rol ?? '').toLowerCase().replace('ñ', 'n')))
  return (gerente ?? data[0]).id as string
}

// Envía a cada asesor (con acciones vencidas o de hoy en sus clientes) un resumen
// consolidado por WhatsApp (si hay sesión de 24h activa con el bot) y por correo.
// El correo sale SIEMPRE desde una única cuenta compartida (la de Gerencia u otro
// usuario del tenant que ya conectó su Gmail en Mi perfil) hacia el correo de
// notificación de cada asesor — nadie más necesita conectar su propio Gmail.
// El asesor "dueño" de una acción es el asesor asignado al CLIENTE
// (clientes.assigned_to) — no quien haya registrado el recordatorio, que puede ser
// otra persona (ej. Gerencia anotando algo para un cliente ajeno).
// Usado tanto por el cron diario como por el disparo manual desde Bot Colaboradores.
export async function ejecutarResumenDiario(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId?: string,
  usuarioId?: string,
  canales: { whatsapp?: boolean; email?: boolean } = {},
): Promise<ResultadoResumenDiario> {
  const enviarWhatsapp = canales.whatsapp ?? true
  const enviarEmail    = canales.email ?? true
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
  const remitenteCache = new Map<string, string | null>()

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
    if (enviarWhatsapp && sesionActiva && usuario.whatsapp_number) {
      if (!cfgCache.has(usuario.tenant_id)) cfgCache.set(usuario.tenant_id, await getCfgMeta(supabase, usuario.tenant_id))
      const cfg = cfgCache.get(usuario.tenant_id)
      if (cfg) {
        const ok = await enviarWADirecto(cfg, usuario.whatsapp_number, construirTexto(usuario.nombre, vencidas, hoyItems))
        if (ok) whatsappEnviados++
      }
    }

    if (enviarEmail) {
      if (!remitenteCache.has(usuario.tenant_id)) remitenteCache.set(usuario.tenant_id, await buscarRemitente(supabase, usuario.tenant_id))
      const remitenteId = remitenteCache.get(usuario.tenant_id)
      if (!remitenteId) {
        emailsFallidos++
        console.warn(`[resumenDiario] Ningún usuario del tenant ${usuario.tenant_id} tiene el correo conectado (Mi perfil) para enviar en nombre de todos.`)
      } else {
        try {
          await sendEmailComoUsuario(
            remitenteId, usuario.email,
            `📋 Tu resumen de hoy — ${vencidas.length + hoyItems.length} pendiente${vencidas.length + hoyItems.length === 1 ? '' : 's'}`,
            construirHtml(usuario.nombre, vencidas, hoyItems)
          )
          emailsEnviados++
        } catch (e) {
          emailsFallidos++
          console.warn(`[resumenDiario] No se pudo enviar correo a ${usuario.nombre}:`, e instanceof Error ? e.message : e)
        }
      }
    }
  }

  return { usuariosNotificados, whatsappEnviados, emailsEnviados, emailsFallidos }
}
