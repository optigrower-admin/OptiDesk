import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarWADirecto, getCfgMeta } from '@/lib/mensajeria/enviar-wa-directo'

export const dynamic = 'force-dynamic'

// Ventana keep-alive: si el usuario no ha respondido en 22-23 horas, pedir confirmación
const KEEPALIVE_MIN_MS = 22 * 3600 * 1000
const KEEPALIVE_MAX_MS = 23 * 3600 * 1000
// Sesión activa: última interacción hace menos de 23 horas
const SESION_ACTIVA_MS = 23 * 3600 * 1000

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const ahora    = new Date()
  const ahoraISO = ahora.toISOString()

  // ── Por tenant: procesar keep-alive y recordatorios ────────────────────────
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id')

  let keepAliveEnviados = 0
  let recordatoriosEnviados = 0

  for (const tenant of (tenants ?? []) as { id: string }[]) {
    const tenantId = tenant.id
    const cfg = await getCfgMeta(supabase, tenantId)
    if (!cfg) continue

    // Usuarios con whatsapp_number configurado y activos
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre, whatsapp_number, wa_sesion_at')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .not('whatsapp_number', 'is', null)

    for (const u of (usuarios ?? []) as {
      id: string; nombre: string | null; whatsapp_number: string; wa_sesion_at: string | null
    }[]) {
      if (!u.whatsapp_number) continue

      const sesionAt = u.wa_sesion_at ? new Date(u.wa_sesion_at) : null
      const edadMs   = sesionAt ? ahora.getTime() - sesionAt.getTime() : null

      // Keep-alive: sesión entre 22 y 23 horas → pedir confirmación
      if (edadMs !== null && edadMs >= KEEPALIVE_MIN_MS && edadMs < KEEPALIVE_MAX_MS) {
        const nombre = u.nombre?.split(' ')[0] ?? 'Hola'
        await enviarWADirecto(cfg, u.whatsapp_number,
          `⏰ ${nombre}, para seguir recibiendo mensajes por WhatsApp, responde *OK* en los próximos 60 minutos.`
        )
        keepAliveEnviados++
        continue
      }

      // Recordatorios: solo si hay sesión activa (< 23h)
      if (edadMs === null || edadMs >= SESION_ACTIVA_MS) continue

      const { data: recordatorios } = await supabase
        .from('recordatorios')
        .select('id, nota, clientes(nombre)')
        .eq('tenant_id', tenantId)
        .eq('asignado_a', u.id)
        .eq('completado', false)
        .not('cliente_id', 'is', null)
        .lte('fecha_recordatorio', ahoraISO)
        .is('wa_enviado_at', null)
        .limit(5)

      if (!recordatorios?.length) continue

      const lineas = (recordatorios as Array<{
        id: string; nota: string | null; clientes: { nombre: string | null }[] | null
      }>).map(r => {
        const nombre = r.clientes?.[0]?.nombre ?? 'Cliente'
        const nota   = r.nota ? ` — ${r.nota.slice(0, 80)}` : ''
        return `• *${nombre}*${nota}`
      }).join('\n')

      const enviado = await enviarWADirecto(cfg, u.whatsapp_number,
        `⏰ *Recordatorios pendientes:*\n\n${lineas}\n\n_Ábrelos en OptiDesk para marcarlos como realizados._`
      )

      if (enviado) {
        // Marcar los recordatorios como enviados por WA
        const ids = (recordatorios as { id: string }[]).map(r => r.id)
        await supabase
          .from('recordatorios')
          .update({ wa_enviado_at: ahoraISO })
          .in('id', ids)
        recordatoriosEnviados += ids.length
      }
    }
  }

  console.log(`[cron/colaboradores] keep-alive: ${keepAliveEnviados} · recordatorios WA: ${recordatoriosEnviados}`)
  return NextResponse.json({ keepAliveEnviados, recordatoriosEnviados })
}
