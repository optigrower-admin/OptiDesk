import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function dec(enc: string): Promise<string> {
  try { const { decrypt } = await import('@/lib/crypto'); return decrypt(enc) } catch { return enc }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json() as { comentario_id: string; texto: string }
  const { comentario_id, texto } = body
  if (!comentario_id || !texto?.trim())
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const admin = createAdminClient()
  const tenantId = perfil.tenant_id

  // Fetch the comment and verify ownership
  const { data: comentario } = await admin.from('comentarios')
    .select('*, publicaciones(tenant_id)')
    .eq('id', comentario_id)
    .maybeSingle()

  const pub = comentario?.publicaciones as Record<string, string> | null
  if (!comentario || pub?.tenant_id !== tenantId)
    return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 })

  const { data: cfg } = await admin.from('config_meta')
    .select('messenger_access_token_enc, instagram_access_token_enc')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!cfg) return NextResponse.json({ error: 'Sin configuración Meta' }, { status: 400 })

  const metaCommentId = comentario.comentario_id
  let metaOk = false

  if (comentario.canal === 'facebook' && cfg.messenger_access_token_enc) {
    const token = await dec(cfg.messenger_access_token_enc)
    // Public reply to Facebook comment: POST /{comment_id}/comments
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${metaCommentId}/comments?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: texto }),
      }
    )
    const result = await r.json() as { id?: string; error?: { message: string } }
    if (!r.ok || result.error) {
      return NextResponse.json({ error: result.error?.message ?? 'Error al responder en Facebook' }, { status: 502 })
    }
    metaOk = true
  } else if (comentario.canal === 'instagram' && cfg.instagram_access_token_enc) {
    const token = await dec(cfg.instagram_access_token_enc)
    // Public reply to Instagram comment: POST /{comment_id}/replies
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${metaCommentId}/replies?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: texto }),
      }
    )
    const result = await r.json() as { id?: string; error?: { message: string } }
    if (!r.ok || result.error) {
      return NextResponse.json({ error: result.error?.message ?? 'Error al responder en Instagram' }, { status: 502 })
    }
    metaOk = true
  }

  if (metaOk) {
    await admin.from('comentarios')
      .update({ estado: 'respondido', updated_at: new Date().toISOString() })
      .eq('id', comentario_id)
  }

  return NextResponse.json({ ok: metaOk })
}
