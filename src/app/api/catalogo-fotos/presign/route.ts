import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedUploadUrl } from '@/lib/r2'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil?.tenant_id) return NextResponse.json({ error: 'Sin tenant' }, { status: 403 })

  const { moto_catalogo_id, tipo, content_type } = await req.json() as {
    moto_catalogo_id: string
    tipo: 'frente' | 'lado' | 'promocional'
    content_type: string
  }

  if (!moto_catalogo_id || !tipo || !['frente', 'lado', 'promocional'].includes(tipo)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const ext = content_type.includes('png') ? 'png' : content_type.includes('webp') ? 'webp' : 'jpg'
  const key = `${perfil.tenant_id}/catalogo/${moto_catalogo_id}/${tipo}.${ext}`
  const url = await getSignedUploadUrl(key, content_type, 900)

  return NextResponse.json({ url, key })
}
