import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function dec(enc: string): Promise<string> {
  try { const { decrypt } = await import('@/lib/crypto'); return decrypt(enc) } catch { return enc }
}

export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('usuarios').select('tenant_id').eq('id', user.id).single()
  if (!perfil) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const admin = createAdminClient()
  const tenantId = perfil.tenant_id

  const { data: cfg } = await admin.from('config_meta')
    .select('messenger_access_token_enc,messenger_page_id,estado_messenger,instagram_access_token_enc,instagram_account_id,estado_instagram')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!cfg) return NextResponse.json({ error: 'Sin configuración Meta' }, { status: 400 })

  const stats = { facebook_posts: 0, facebook_comments: 0, instagram_posts: 0, instagram_comments: 0, comment_errors: [] as string[] }

  // Pre-decrypt Facebook page token — needed by both subscription and FB posts sync
  let fbToken: string | null = null
  let pageId: string | null  = null
  if (cfg.messenger_access_token_enc && cfg.messenger_page_id) {
    fbToken = await dec(cfg.messenger_access_token_enc)
    pageId  = cfg.messenger_page_id
  }

  // Suscribir la página al webhook del app — solo campos válidos para Page
  if (pageId && fbToken) {
    try {
      const subRes = await fetch(
        `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_token: fbToken,
            subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads,feed',
          }),
        }
      )
      const subData = await subRes.json()
      console.log('[sync] subscribed_apps →', JSON.stringify(subData))
    } catch (e) {
      console.error('[sync] subscribed_apps error:', e)
    }
  }

  // ── Facebook posts + comments ─────────────────────────────────────────────
  if (cfg.estado_messenger === 'conectado' && fbToken && pageId) {

    const postsRes = await fetch(
      `https://graph.facebook.com/v20.0/${pageId}/posts?fields=id,message,story,created_time,permalink_url,full_picture&limit=20&access_token=${fbToken}`
    )
    if (postsRes.ok) {
      type FBPost = { id: string; message?: string; story?: string; created_time?: string; permalink_url?: string; full_picture?: string }
      const postsData = await postsRes.json() as { data?: FBPost[] }

      for (const post of postsData.data ?? []) {
        stats.facebook_posts++

        const { data: pub } = await admin.from('publicaciones').upsert({
          tenant_id:        tenantId,
          canal:            'facebook',
          publicacion_id:   post.id,
          caption:          post.message ?? post.story ?? null,
          media_url:        post.full_picture ?? null,
          media_type:       'POST',
          permalink:        post.permalink_url ?? null,
          synced_at:        new Date().toISOString(),
          created_at:       post.created_time ? new Date(post.created_time).toISOString() : new Date().toISOString(),
        }, { onConflict: 'tenant_id,publicacion_id' }).select('id').maybeSingle()

        if (!pub) continue

        // Facebook requires App Review (pages_read_engagement + Page Public Content Access)
        // to read historical comments via API. New comments arrive via the feed webhook instead.
        // We only update the count from what we already have in DB to avoid clearing it.
        const { count: existingCount } = await admin.from('comentarios')
          .select('*', { count: 'exact', head: true })
          .eq('publicacion_id', pub.id)

        await admin.from('publicaciones')
          .update({ comentarios_count: existingCount ?? 0 })
          .eq('id', pub.id)
      }
    }
  }

  // ── Instagram media + comments ────────────────────────────────────────────
  if (cfg.estado_instagram === 'conectado' && cfg.instagram_access_token_enc && cfg.instagram_account_id) {
    const igToken     = await dec(cfg.instagram_access_token_enc)
    const igAccountId = cfg.instagram_account_id

    // Webhook subscription for IG comments already done above with fbToken

    const mediaRes = await fetch(
      `https://graph.facebook.com/v20.0/${igAccountId}/media?fields=id,caption,media_type,thumbnail_url,media_url,permalink,timestamp&limit=20&access_token=${igToken}`
    )
    if (mediaRes.ok) {
      type IGMedia = { id: string; caption?: string; media_type?: string; thumbnail_url?: string; media_url?: string; permalink?: string; timestamp?: string }
      const mediaData = await mediaRes.json() as { data?: IGMedia[] }

      for (const media of mediaData.data ?? []) {
        stats.instagram_posts++

        const { data: pub } = await admin.from('publicaciones').upsert({
          tenant_id:      tenantId,
          canal:          'instagram',
          publicacion_id: media.id,
          caption:        media.caption ?? null,
          media_url:      media.thumbnail_url ?? media.media_url ?? null,
          media_type:     media.media_type ?? 'IMAGE',
          permalink:      media.permalink ?? null,
          synced_at:      new Date().toISOString(),
          created_at:     media.timestamp ? new Date(media.timestamp).toISOString() : new Date().toISOString(),
        }, { onConflict: 'tenant_id,publicacion_id' }).select('id').maybeSingle()

        if (!pub) continue

        type IGComment = { id: string; text?: string; from?: { id?: string; username?: string }; timestamp?: string }
        const commRes  = await fetch(
          `https://graph.facebook.com/v20.0/${media.id}/comments?fields=id,text,from%7Bid%2Cusername%7D,timestamp&limit=100&access_token=${igToken}`
        )
        const commData = await commRes.json() as { data?: IGComment[]; error?: { message: string; code: number } }
        if (!commRes.ok || commData.error) {
          stats.comment_errors.push(`IG: ${commData.error?.message ?? `HTTP ${commRes.status}`}`)
          continue
        }
        const comments = commData.data ?? []
        stats.instagram_comments += comments.length

        for (const c of comments) {
          await admin.from('comentarios').upsert({
            tenant_id:      tenantId,
            publicacion_id: pub.id,
            canal:          'instagram',
            comentario_id:  c.id,
            texto:          c.text ?? null,
            autor_id:       c.from?.id ?? null,
            autor_username: c.from?.username ?? null,
            autor_nombre:   c.from?.username ? `@${c.from.username}` : null,
            estado:         'nuevo',
            es_respuesta:   false,
            created_at:     c.timestamp ? new Date(c.timestamp).toISOString() : new Date().toISOString(),
          }, { onConflict: 'tenant_id,comentario_id', ignoreDuplicates: true })
        }

        await admin.from('publicaciones')
          .update({ comentarios_count: comments.length })
          .eq('id', pub.id)
      }
    }
  }

  return NextResponse.json({ ok: true, ...stats })
}
