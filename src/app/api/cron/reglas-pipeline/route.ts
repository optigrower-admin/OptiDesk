import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Corre una vez al día: mueve clientes automáticamente de una etapa a otra
// cuando llevan N días en la etapa de origen (definido en reglas_transicion_pipeline).
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: reglas } = await admin
    .from('reglas_transicion_pipeline')
    .select(`
      id, tenant_id, nombre, dias_en_etapa,
      etapa_origen:etapa_origen_id ( id, clave ),
      etapa_destino:etapa_destino_id ( id, clave, orden, requiere_aprobacion_gerencia )
    `)
    .eq('activa', true)

  let movidos = 0
  let bloqueados = 0
  const errores: string[] = []

  for (const regla of (reglas ?? []) as unknown as {
    id: string; tenant_id: string; nombre: string; dias_en_etapa: number
    etapa_origen: { id: string; clave: string } | null
    etapa_destino: { id: string; clave: string; orden: number; requiere_aprobacion_gerencia: boolean } | null
  }[]) {
    if (!regla.etapa_origen || !regla.etapa_destino) continue

    try {
      const { data: candidatos } = await admin
        .from('clientes')
        .select('id, estado_aprobacion_matricula')
        .eq('tenant_id', regla.tenant_id)
        .eq('etapa_venta', regla.etapa_origen.clave)

      if (!candidatos?.length) continue

      const ids = candidatos.map(c => c.id)
      const { data: historiales } = await admin
        .from('historial_etapas_cliente')
        .select('cliente_id, created_at')
        .in('cliente_id', ids)
        .order('created_at', { ascending: false })

      // Última entrada de historial por cliente = fecha en que entró a la etapa actual
      const ultimaEntrada = new Map<string, string>()
      for (const h of historiales ?? []) {
        if (!ultimaEntrada.has(h.cliente_id)) ultimaEntrada.set(h.cliente_id, h.created_at)
      }

      const umbralMs = regla.dias_en_etapa * 86_400_000

      for (const cliente of candidatos) {
        const desde = ultimaEntrada.get(cliente.id)
        if (!desde) continue // sin historial de esta etapa todavía — no evaluamos por seguridad
        const diasTranscurridos = Date.now() - new Date(desde).getTime()
        if (diasTranscurridos < umbralMs) continue

        // Respeta el bloqueo de aprobación de gerencia si la etapa destino lo exige
        if (regla.etapa_destino.requiere_aprobacion_gerencia && cliente.estado_aprobacion_matricula !== 'aprobado') {
          bloqueados++
          continue
        }

        const { error } = await admin.from('clientes')
          .update({ etapa_venta: regla.etapa_destino.clave, etapa_venta_orden: regla.etapa_destino.orden })
          .eq('id', cliente.id)

        if (error) errores.push(`${cliente.id}: ${error.message}`)
        else movidos++
      }

      await admin.from('reglas_transicion_pipeline').update({ ultima_corrida_at: new Date().toISOString() }).eq('id', regla.id)
    } catch (e: unknown) {
      errores.push(`regla ${regla.nombre}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  return NextResponse.json({ ok: true, movidos, bloqueados, errores })
}
