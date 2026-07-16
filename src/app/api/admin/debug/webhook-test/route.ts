import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Endpoint de diagnóstico — muestra estado real del cliente y fuerza seguimiento
// Protegido con clave interna; eliminar después de confirmar que funciona.
const DEBUG_KEY = 'optidesk-debug-2026'

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    key: string
    tenant_id: string
    phone: string        // número completo, ej: 573001234567
    force?: boolean      // si true, fuerza en_seguimiento_ventas=true
  }

  if (body.key !== DEBUG_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { tenant_id, phone, force = false } = body
  const supabase = createAdminClient()
  const log: string[] = []

  // ── 1. Ver constraint actual de etapa_venta ──────────────────────────────
  const { data: constraintRows } = await supabase.rpc('check_etapa_constraint' as never).catch(() => ({ data: null }))
  log.push(`[constraint] rpc no disponible — verifica en Supabase SQL`)

  // ── 2. Estado del cliente por whatsapp_number ────────────────────────────
  const { data: byWa, error: errWa } = await supabase
    .from('clientes')
    .select('id, nombre, celular, whatsapp_number, en_seguimiento_ventas, etapa_venta, etapa_venta_orden')
    .eq('tenant_id', tenant_id)
    .eq('whatsapp_number', phone)
    .maybeSingle()

  log.push(`[whatsapp_number=${phone}] → ${byWa ? JSON.stringify(byWa) : `no encontrado (err: ${errWa?.message})`}`)

  // ── 3. Estado del cliente por celular (con normalización) ────────────────
  const phoneShort = phone.startsWith('57') && phone.length === 12 ? phone.slice(2) : null

  const { data: byCel } = await supabase
    .from('clientes')
    .select('id, nombre, celular, whatsapp_number, en_seguimiento_ventas, etapa_venta')
    .eq('tenant_id', tenant_id)
    .eq('celular', phone)
    .maybeSingle()
  log.push(`[celular=${phone}] → ${byCel ? `id=${byCel.id} nombre=${byCel.nombre}` : 'no encontrado'}`)

  let byCelShort = null
  if (phoneShort) {
    const { data } = await supabase
      .from('clientes')
      .select('id, nombre, celular, whatsapp_number, en_seguimiento_ventas, etapa_venta')
      .eq('tenant_id', tenant_id)
      .eq('celular', phoneShort)
      .maybeSingle()
    byCelShort = data
    log.push(`[celular_sin_57=${phoneShort}] → ${byCelShort ? `id=${byCelShort.id} nombre=${byCelShort.nombre}` : 'no encontrado'}`)
  }

  // ── 4. Conversaciones activas ────────────────────────────────────────────
  const { data: convs } = await supabase
    .from('conversaciones')
    .select('id, estado, cliente_id, updated_at')
    .eq('tenant_id', tenant_id)
    .eq('canal_contact_id', phone)
    .order('updated_at', { ascending: false })
    .limit(5)
  log.push(`[conversaciones canal_contact_id=${phone}] → ${JSON.stringify(convs?.map(c => ({ id: c.id, estado: c.estado, cliente_id: c.cliente_id })))}`)

  // ── 5. Si force=true, forzar seguimiento en el cliente encontrado ────────
  const clienteEncontrado = byWa ?? byCel ?? byCelShort
  if (force && clienteEncontrado) {
    log.push(`[force] intentando UPDATE en_seguimiento_ventas para id=${clienteEncontrado.id}`)

    // Intento 1: con nuevo_mensaje
    const { error: e1 } = await supabase.from('clientes').update({
      en_seguimiento_ventas: true,
      etapa_venta:           'nuevo_mensaje',
      etapa_venta_orden:     -1,
    }).eq('id', clienteEncontrado.id)

    if (e1) {
      log.push(`[force] error con nuevo_mensaje: ${e1.message} (code=${e1.code})`)
      // Intento 2: fallback a 'nuevo'
      const { error: e2 } = await supabase.from('clientes').update({
        en_seguimiento_ventas: true,
        etapa_venta:           'nuevo',
        etapa_venta_orden:     0,
      }).eq('id', clienteEncontrado.id)
      log.push(`[force] fallback 'nuevo': ${e2 ? `ERROR ${e2.message}` : 'OK'}`)
    } else {
      log.push(`[force] ✓ UPDATE exitoso con etapa nuevo_mensaje`)
    }

    // Intento opcional: nombre_pendiente
    const { error: e3 } = await supabase.from('clientes')
      .update({ nombre_pendiente_aprobacion: true })
      .eq('id', clienteEncontrado.id)
    log.push(`[force] nombre_pendiente_aprobacion: ${e3 ? `ERROR ${e3.message} (code=${e3.code})` : 'OK'}`)

    // Estado final
    const { data: final } = await supabase.from('clientes')
      .select('id, nombre, en_seguimiento_ventas, etapa_venta, etapa_venta_orden')
      .eq('id', clienteEncontrado.id)
      .single()
    log.push(`[force] estado final: ${JSON.stringify(final)}`)
  }

  // ── 6. Listar flujos activos con trigger mensaje_nuevo ───────────────────
  const { data: flujos, error: flujoErr } = await supabase
    .from('flujos_automatizacion')
    .select('id, nombre, activo, trigger_tipo')
    .eq('tenant_id', tenant_id)
    .eq('trigger_tipo', 'mensaje_nuevo')
  log.push(`[flujos mensaje_nuevo] → ${JSON.stringify(flujos)} err=${flujoErr?.message ?? 'none'}`)

  const { data: todosLosFlujos } = await supabase
    .from('flujos_automatizacion')
    .select('id, nombre, activo, trigger_tipo')
    .eq('tenant_id', tenant_id)
  log.push(`[todos los flujos del tenant] → ${JSON.stringify(todosLosFlujos?.map(f => ({ nombre: f.nombre, activo: f.activo, trigger: f.trigger_tipo })))}`)

  void constraintRows

  return NextResponse.json({ ok: true, phone, tenant_id, cliente: clienteEncontrado, log })
}
