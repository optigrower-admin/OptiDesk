import type { createAdminClient } from '@/lib/supabase/admin'

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
        text: { body: text, preview_url: false },
      }),
    }
  )
  if (!r.ok) {
    const err = await r.text().catch(() => '')
    console.error('[enviarWADirecto] Error:', r.status, err)
  }
  return r.ok
}
