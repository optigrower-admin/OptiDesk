import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase
    .from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ clientes: [], ordenes: [] })

  const admin = createAdminClient()
  const like = `%${q}%`

  // 1. Buscar en clientes por nombre, celular o cédula
  const { data: clientes } = await admin
    .from('clientes')
    .select('id, nombre, celular, cedula, numero_documento, en_seguimiento_ventas')
    .eq('tenant_id', perfil.tenant_id)
    .or(`nombre.ilike.${like},celular.ilike.${like},cedula.ilike.${like},numero_documento.ilike.${like}`)
    .order('nombre')
    .limit(8)

  // 2. Buscar en ordenes por placa (para cruzar con el teléfono)
  const { data: ordenesPlaca } = await admin
    .from('ordenes')
    .select('cliente, telefono, placa')
    .eq('tenant_id', perfil.tenant_id)
    .ilike('placa', like)
    .not('placa', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5)

  // Deduplicar ordenes por placa
  const seen = new Set<string>()
  const ordenesUniq = (ordenesPlaca ?? []).filter(o => {
    const key = (o.placa ?? '').toUpperCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return NextResponse.json({
    clientes: clientes ?? [],
    ordenes: ordenesUniq,
  })
}
