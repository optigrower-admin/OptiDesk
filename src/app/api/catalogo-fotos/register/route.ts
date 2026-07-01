import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const { moto_catalogo_id, tipo, r2_key } = await req.json() as {
    moto_catalogo_id: string
    tipo: 'frente' | 'lado' | 'promocional'
    r2_key: string
  }

  const { data, error } = await supabase
    .from('motos_catalogo_fotos')
    .upsert({ moto_catalogo_id, tenant_id: perfil.tenant_id, tipo, r2_key }, { onConflict: 'moto_catalogo_id,tipo' })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
