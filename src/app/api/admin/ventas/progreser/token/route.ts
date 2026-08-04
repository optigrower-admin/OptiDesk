import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signPayload } from '@/lib/crypto'

const FORM_URL = 'https://sipresplus-cloud.progreser.com/aprobacion-cupo/motocicleta'
const CAMPOS_REQUERIDOS = ['primer_nombre', 'primer_apellido', 'cedula', 'celular', 'email'] as const
const CAMPO_LABEL: Record<string, string> = {
  primer_nombre: 'Primer nombre', primer_apellido: 'Primer apellido', cedula: 'Número de cédula',
  celular: 'Celular', email: 'Correo electrónico',
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null) as { cliente_id?: string } | null
  if (!body?.cliente_id) return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })

  const admin = createAdminClient()
  const { data: cliente } = await admin.from('clientes')
    .select('primer_nombre, primer_apellido, cedula, celular, email')
    .eq('id', body.cliente_id).eq('tenant_id', perfil.tenant_id).single()

  if (!cliente) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const faltantes = CAMPOS_REQUERIDOS.filter(c => !cliente[c])
  if (faltantes.length) {
    return NextResponse.json({ error: `Faltan datos del cliente: ${faltantes.map(f => CAMPO_LABEL[f]).join(', ')}.` }, { status: 400 })
  }

  // Token de corta duración (10 min) — solo autoriza leer los datos básicos
  // de ESTE cliente puntual, no da acceso a nada más.
  const token = signPayload({ tenant_id: perfil.tenant_id, cliente_id: body.cliente_id, exp: Date.now() + 10 * 60 * 1000 })

  return NextResponse.json({ url: `${FORM_URL}?optidesk=${encodeURIComponent(token)}` })
}
