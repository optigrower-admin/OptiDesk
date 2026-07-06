import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmailComoUsuario } from '@/lib/email'

export const dynamic = 'force-dynamic'

const NOTA_AUTOMATICA: Record<string, string> = {
  credito_sin_iniciar:    'El estudio de crédito de este cliente todavía no se ha iniciado',
  entrega_moto_pendiente: 'Este cliente tiene una moto pendiente de entrega',
  cliente_sin_movimiento: 'Este cliente no ha tenido movimiento reciente en su seguimiento',
}

async function generarRecordatoriosAutomaticos(supabase: ReturnType<typeof createAdminClient>) {
  const { data: reglas } = await supabase
    .from('tipos_recordatorio_automatico')
    .select('tenant_id, tipo, dias_umbral')
    .eq('activo', true)

  let creados = 0

  for (const regla of reglas ?? []) {
    const umbralFecha = new Date(Date.now() - regla.dias_umbral * 86400000).toISOString()
    let candidatos: { id: string; assigned_to: string | null }[] = []

    if (regla.tipo === 'credito_sin_iniciar') {
      const { data } = await supabase
        .from('clientes')
        .select('id, assigned_to')
        .eq('tenant_id', regla.tenant_id)
        .eq('en_seguimiento_ventas', true)
        .eq('forma_pago', 'credito')
        .lte('updated_at', umbralFecha)
      candidatos = data ?? []
    } else if (regla.tipo === 'entrega_moto_pendiente') {
      const { data } = await supabase
        .from('clientes')
        .select('id, assigned_to')
        .eq('tenant_id', regla.tenant_id)
        .eq('en_seguimiento_ventas', true)
        .in('etapa_venta', ['en_matricula', 'alistamiento', 'espera_entrega'])
        .lte('updated_at', umbralFecha)
      candidatos = data ?? []
    } else if (regla.tipo === 'cliente_sin_movimiento') {
      const { data } = await supabase
        .from('clientes')
        .select('id, assigned_to')
        .eq('tenant_id', regla.tenant_id)
        .eq('en_seguimiento_ventas', true)
        .in('etapa_venta', ['nuevo', 'seguimiento', 'buscando_credito', 'calificado', 'demo', 'propuesta', 'negociacion'])
        .lte('updated_at', umbralFecha)
      candidatos = data ?? []
    }

    for (const cliente of candidatos) {
      const { data: existente } = await supabase
        .from('recordatorios')
        .select('id')
        .eq('cliente_id', cliente.id)
        .eq('tipo_automatico', regla.tipo)
        .eq('completado', false)
        .maybeSingle()
      if (existente) continue

      await supabase.from('recordatorios').insert({
        tenant_id: regla.tenant_id,
        cliente_id: cliente.id,
        asignado_a: cliente.assigned_to,
        nota: NOTA_AUTOMATICA[regla.tipo] ?? regla.tipo,
        fecha_recordatorio: new Date().toISOString(),
        tipo: 'seguimiento_auto',
        tipo_automatico: regla.tipo,
      })
      creados++
    }
  }

  return creados
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const ahora    = new Date().toISOString()

  const automaticosCreados = await generarRecordatoriosAutomaticos(supabase)

  // Recordatorios vencidos pendientes de enviar por correo
  const { data: paraEmail } = await supabase
    .from('recordatorios')
    .select('id, nota, email_destino, asignado_a')
    .eq('enviar_email', true)
    .is('email_enviado_at', null)
    .eq('completado', false)
    .lte('fecha_recordatorio', ahora)
    .limit(100)

  let emailsEnviados = 0
  for (const r of paraEmail ?? []) {
    if (!r.email_destino || !r.asignado_a) continue
    try {
      await sendEmailComoUsuario(r.asignado_a, r.email_destino, 'Recordatorio de seguimiento', `<p>${r.nota ?? 'Tienes un recordatorio pendiente.'}</p>`)
      await supabase.from('recordatorios').update({ email_enviado_at: new Date().toISOString() }).eq('id', r.id)
      emailsEnviados++
    } catch (e) {
      console.error('[cron/recordatorios] Error enviando email:', e)
    }
  }

  // Los recordatorios de conversaciones (Mensajes) solo se muestran como "pasados" cuando
  // su fecha ya venció (sin necesidad de marcarlos completado) — ver bandeja de Mensajes.
  // Los de Seguimiento Ventas (cliente_id) quedan pendientes hasta que alguien los marque
  // como hechos manualmente desde la ficha del cliente — así no desaparecen solos sin atenderse.

  console.log(`[cron/recordatorios] Automáticos creados ${automaticosCreados} · emails enviados ${emailsEnviados}`)
  return NextResponse.json({ automaticosCreados, emailsEnviados })
}
