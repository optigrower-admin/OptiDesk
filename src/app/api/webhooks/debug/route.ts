import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { buscarOCrearCliente } from '@/lib/clientes/buscarOCrearCliente'

export const dynamic = 'force-dynamic'

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
    log.push(`Iniciando para phone=${phone} tenant=${tenant_id}`)

    // Diagnóstico de variables de entorno (sin exponer valores)
    const envVars = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_KEY',
      'SUPABASE_ADMIN_KEY',
      'SUPABASE_KEY',
    ]
    for (const v of envVars) {
      const val = process.env[v]
      log.push(`${v}: ${val ? `SET len=${val.length} first12=${JSON.stringify(val.slice(0,12))}` : 'NOT SET'}`)
    }

    // Verificar que el admin client funciona antes de llamar buscarOCrearCliente
    const { data: testRow, error: testErr } = await supabase
      .from('tenants').select('id').limit(1).maybeSingle()
    log.push(`Admin client test — data=${JSON.stringify(testRow)} err=${testErr?.message ?? 'OK'}`)

    const { cliente, creado } = await buscarOCrearCliente({
      tenantId: tenant_id,
      canal: 'whatsapp',
      contactId: phone,
      celular: phone,
      nombre: `Debug ${phone}`,
      supabaseClient: supabase,
    })

    log.push(`buscarOCrearCliente OK — creado=${creado} id=${cliente?.id}`)

    if (cliente) {
      const { error: updErr } = await supabase.from('clientes').update({
        en_seguimiento_ventas:       true,
        etapa_venta:                 'nuevo',
        etapa_venta_orden:           0,
        nombre_pendiente_aprobacion: true,
      } as Record<string, unknown>).eq('id', cliente.id)

      log.push(`UPDATE resultado — error=${updErr?.message ?? 'ninguno'}`)

      const { data: estado } = await supabase
        .from('clientes')
        .select('id, nombre, en_seguimiento_ventas, etapa_venta, nombre_pendiente_aprobacion')
        .eq('id', cliente.id)
        .maybeSingle()

      log.push(`Estado final: ${JSON.stringify(estado)}`)
    }

    return NextResponse.json({ ok: true, log })
  } catch (e: unknown) {
    log.push(`ERROR CRITICO: ${e instanceof Error ? e.message : String(e)}`)
    return NextResponse.json({ ok: false, log }, { status: 500 })
  }
}
