import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin perfil' }, { status: 403 })

  const { conversacion_id, nombre } = await req.json()
  if (!conversacion_id || !nombre?.trim())
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const admin = createAdminClient()

  // Verificar que la conversación pertenece al tenant
  const { data: conv, error: convErr } = await admin
    .from('conversaciones')
    .select('id, canal, canal_contact_id, cliente_id')
    .eq('id', conversacion_id)
    .eq('tenant_id', perfil.tenant_id)
    .single()
  if (convErr || !conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })

  const nombreLimpio = nombre.trim()

  if (conv.cliente_id) {
    // Cliente ya existe → solo actualizar nombre
    const { error } = await admin
      .from('clientes')
      .update({ nombre: nombreLimpio })
      .eq('id', conv.cliente_id)
      .eq('tenant_id', perfil.tenant_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, cliente_id: conv.cliente_id, nombre: nombreLimpio })
  }

  // Cliente nuevo → insertar con el número correcto según el canal
  const insertData: Record<string, string> = {
    nombre: nombreLimpio,
    tenant_id: perfil.tenant_id,
  }
  if (conv.canal === 'whatsapp')   insertData.whatsapp_number = conv.canal_contact_id
  if (conv.canal === 'messenger')  insertData.messenger_id    = conv.canal_contact_id
  if (conv.canal === 'instagram')  insertData.instagram_id    = conv.canal_contact_id

  const { data: nuevo, error: insertErr } = await admin
    .from('clientes')
    .insert(insertData)
    .select('id')
    .single()
  if (insertErr || !nuevo) return NextResponse.json({ error: insertErr?.message ?? 'Error al crear cliente' }, { status: 500 })

  // Vincular a la conversación
  const { error: linkErr } = await admin
    .from('conversaciones')
    .update({ cliente_id: nuevo.id })
    .eq('id', conversacion_id)
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, cliente_id: nuevo.id, nombre: nombreLimpio })
}
