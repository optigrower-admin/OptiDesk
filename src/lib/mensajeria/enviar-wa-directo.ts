import type { createAdminClient } from '@/lib/supabase/admin'
import { sanitizarFormatoWhatsapp } from './formatoWhatsapp'

export interface CfgMeta {
  wa_phone_number_id: string
  wa_access_token_enc: string
}

export async function getCfgMeta(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string
): Promise<CfgMeta | null> {
  const { data } = await supabase
    .from('config_meta')
    .select('wa_phone_number_id, wa_access_token_enc')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!data?.wa_phone_number_id || !data?.wa_access_token_enc) return null
  return data as CfgMeta
}

export async function enviarWADirecto(
  cfg: CfgMeta,
  to: string,
  text: string
): Promise<boolean> {
  let token = cfg.wa_access_token_enc
  try {
    const { decrypt } = await import('@/lib/crypto')
    token = decrypt(cfg.wa_access_token_enc)
  } catch { /* dev — token sin encriptar */ }

  const r = await fetch(
    `https://graph.facebook.com/v20.0/${cfg.wa_phone_number_id}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: sanitizarFormatoWhatsapp(text), preview_url: false },
      }),
    }
  )
  if (!r.ok) {
    const err = await r.text().catch(() => '')
    console.error('[enviarWADirecto] Error:', r.status, err)
  }
  return r.ok
}

// Envía una imagen directa (ej. gráfico de reporte) a un número, sin pasar
// por una conversación de la bandeja — mismo caso de uso que enviarWADirecto
// (bot de colaboradores). Sube la imagen a la Media API de Meta primero.
export async function enviarWAImagenDirecta(
  cfg: CfgMeta,
  to: string,
  imagen: Buffer,
  caption: string
): Promise<boolean> {
  let token = cfg.wa_access_token_enc
  try {
    const { decrypt } = await import('@/lib/crypto')
    token = decrypt(cfg.wa_access_token_enc)
  } catch { /* dev — token sin encriptar */ }

  const mediaForm = new FormData()
  mediaForm.append('file', new Blob([new Uint8Array(imagen)], { type: 'image/png' }), 'grafico.png')
  mediaForm.append('type', 'image/png')
  mediaForm.append('messaging_product', 'whatsapp')

  const uploadRes = await fetch(
    `https://graph.facebook.com/v20.0/${cfg.wa_phone_number_id}/media`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: mediaForm }
  )
  if (!uploadRes.ok) {
    console.error('[enviarWAImagenDirecta] Error subiendo media:', uploadRes.status, await uploadRes.text().catch(() => ''))
    return false
  }
  const { id: mediaId } = await uploadRes.json() as { id: string }

  const r = await fetch(
    `https://graph.facebook.com/v20.0/${cfg.wa_phone_number_id}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'image',
        image: { id: mediaId, caption: caption.slice(0, 1024) },
      }),
    }
  )
  if (!r.ok) {
    console.error('[enviarWAImagenDirecta] Error enviando:', r.status, await r.text().catch(() => ''))
  }
  return r.ok
}
