import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { buscarOCrearCliente } from '@/lib/clientes/buscarOCrearCliente'

export const dynamic = 'force-dynamic'

// Endpoint temporal de diagnóstico — permite probar la creación de clientes desde producción
// Protegido con clave interna; eliminar después de confirmar que funciona.
const DEBUG_KEY = 'optidesk-debug-2026'

export async function POST(request: NextRequest) {
  const { key, tenant_id, phone } = await request.json() as {
    key: string
    tenant_id: string
    phone: string
  }

  if (key !== DEBUG_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const log: string[] = []

  try {
    log.push(`Buscando/creando cliente para ${phone} en tenant ${tenant_id}`)

    const { cliente, creado } = await buscarOCrearCliente({
      tenantId: tenant_id,
      canal: 'whatsapp',
      contactId: phone,
      celular: phone,
      nombre: `Test ${phone}`,
    })

    log.push(`buscarOCrearCliente OK — creado=${creado} id=${cliente?.id}`)

    if (cliente) {
      const { error: updErr } = await supabase.from('clientes').update({
        en_seguimiento_ventas:       true,
        etapa_venta:                 'nuevo',
        etapa_venta_orden:           0,
        nombre_pendiente_aprobacion: true,
      } as Record<string, unknown>).eq('id', cliente.id)

      log.push(`UPDATE en_seguimiento_ventas — error=${updErr?.message ?? 'ninguno'}`)
    }

    // Verificar columna nombre_pendiente_aprobacion
    const { data: col, error: colErr } = await supabase
      .from('clientes')
      .select('id, nombre_pendiente_aprobacion, en_seguimiento_ventas, etapa_venta')
      .eq('id', cliente?.id ?? '')
      .maybeSingle()

    log.push(`Estado final: ${JSON.stringify(col)} err=${colErr?.message ?? 'ninguno'}`)

    return NextResponse.json({ ok: true, log })
  } catch (e: unknown) {
    log.push(`ERROR: ${e instanceof Error ? e.message : String(e)}`)
    return NextResponse.json({ ok: false, log }, { status: 500 })
  }
}
